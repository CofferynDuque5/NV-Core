import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import {
  MEDIA_TYPES,
  type MediaAsset,
  type MediaFolder,
  type MediaType,
  type MediaUploadSignature,
} from "@nv/domain";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapMediaAsset, mapMediaFolder } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { buildUploadSignature, parseCloudinaryUrl } from "./cloudinary";

export class CreateFolderDto {
  @IsString() @MinLength(1) label!: string;
}

export class CreateAssetDto {
  @IsIn(MEDIA_TYPES) type!: MediaType;
  @IsString() @MinLength(1) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() folderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional({ description: "URL (p.ej. de Cloudinary)" })
  @IsOptional()
  @IsString()
  url?: string;
}

/** Rename / retag / move an asset. All fields optional. */
export class UpdateAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) title?: string;
  @ApiPropertyOptional({ description: "Etiqueta; cadena vacía para quitarla." })
  @IsOptional()
  @IsString()
  tag?: string;
  @ApiPropertyOptional({ description: "Carpeta destino; cadena vacía para mover a la raíz." })
  @IsOptional()
  @IsString()
  folderId?: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  /** Signed params for a direct browser→Cloudinary upload; null when unconfigured. */
  uploadSignature(workspaceId: string, folder?: string): MediaUploadSignature | null {
    const creds = parseCloudinaryUrl(this.config.get("integrations", { infer: true }).cloudinary.url);
    if (!creds) return null;
    // Scope uploads to the workspace to keep tenants' media separate.
    const targetFolder = folder ? `nv-core/${workspaceId}/${folder}` : `nv-core/${workspaceId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = buildUploadSignature(
      { folder: targetFolder, timestamp },
      creds.apiSecret,
    );
    return {
      cloudName: creds.cloudName,
      apiKey: creds.apiKey,
      timestamp,
      signature,
      folder: targetFolder,
    };
  }

  async folders(workspaceId: string): Promise<MediaFolder[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.mediaFolder.findMany({
      where: { workspaceSlug: workspaceId },
      include: { _count: { select: { assets: true } } },
      orderBy: { label: "asc" },
    });
    return rows.map(mapMediaFolder);
  }

  async assets(
    workspaceId: string,
    query: { folderId?: string; q?: string; tag?: string } = {},
  ): Promise<ListResultDto<MediaAsset>> {
    if (!this.prisma.enabled) return ListResultDto.empty<MediaAsset>();
    const where = {
      workspaceSlug: workspaceId,
      ...(query.folderId ? { folderId: query.folderId } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
      ...(query.q ? { title: { contains: query.q, mode: "insensitive" as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapMediaAsset), total);
  }

  /** Distinct non-empty tags in the workspace (for filter chips). */
  async tags(workspaceId: string): Promise<string[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.mediaAsset.findMany({
      where: { workspaceSlug: workspaceId, tag: { not: null } },
      select: { tag: true },
      distinct: ["tag"],
      orderBy: { tag: "asc" },
    });
    return rows.map((r) => r.tag).filter((t): t is string => Boolean(t));
  }

  async createFolder(workspaceId: string, actor: string, dto: CreateFolderDto): Promise<MediaFolder> {
    const row = await this.db().mediaFolder.create({
      data: { workspaceSlug: workspaceId, label: dto.label },
      include: { _count: { select: { assets: true } } },
    });
    await this.audit.record(workspaceId, actor, "media.folder.create", row.id);
    return mapMediaFolder(row);
  }

  async createAsset(workspaceId: string, actor: string, dto: CreateAssetDto): Promise<MediaAsset> {
    const row = await this.db().mediaAsset.create({
      data: {
        workspaceSlug: workspaceId,
        type: dto.type,
        title: dto.title,
        folderId: dto.folderId,
        tag: dto.tag,
        url: dto.url,
      },
    });
    await this.audit.record(workspaceId, actor, "media.asset.create", row.id);
    return mapMediaAsset(row);
  }

  async updateAsset(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateAssetDto,
  ): Promise<MediaAsset> {
    const existing = await this.db().mediaAsset.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Archivo no encontrado.");
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.tag !== undefined) data.tag = dto.tag || null;
    if (dto.folderId !== undefined) data.folderId = dto.folderId || null;
    const row = await this.db().mediaAsset.update({ where: { id }, data });
    await this.audit.record(workspaceId, actor, "media.asset.update", id);
    return mapMediaAsset(row);
  }

  async removeAsset(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().mediaAsset.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Archivo no encontrado.");
    await this.audit.record(workspaceId, actor, "media.asset.delete", id);
  }
}

@ApiTags("media")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/media")
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Get("folders")
  folders(@WorkspaceId() workspaceId: string) {
    return this.service.folders(workspaceId);
  }

  @Get("assets")
  assets(
    @WorkspaceId() workspaceId: string,
    @Query("folderId") folderId?: string,
    @Query("q") q?: string,
    @Query("tag") tag?: string,
  ) {
    return this.service.assets(workspaceId, { folderId, q, tag });
  }

  @Get("tags")
  tags(@WorkspaceId() workspaceId: string) {
    return this.service.tags(workspaceId);
  }

  @Get("upload-signature")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  uploadSignature(@WorkspaceId() workspaceId: string, @Query("folder") folder?: string) {
    return this.service.uploadSignature(workspaceId, folder);
  }

  @Post("folders")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  createFolder(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFolderDto,
  ) {
    return this.service.createFolder(workspaceId, user.email, dto);
  }

  @Post("assets")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  createAsset(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAssetDto,
  ) {
    return this.service.createAsset(workspaceId, user.email, dto);
  }

  @Patch("assets/:id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  updateAsset(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.service.updateAsset(workspaceId, user.email, id, dto);
  }

  @Delete("assets/:id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  removeAsset(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.removeAsset(workspaceId, user.email, id);
  }
}

@Module({ controllers: [MediaController], providers: [MediaService] })
export class MediaModule {}
