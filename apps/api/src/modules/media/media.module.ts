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
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { MEDIA_TYPES, type MediaAsset, type MediaFolder, type MediaType } from "@nv/domain";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

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

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
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

  async assets(workspaceId: string, folderId?: string): Promise<ListResultDto<MediaAsset>> {
    if (!this.prisma.enabled) return ListResultDto.empty<MediaAsset>();
    const where = { workspaceSlug: workspaceId, ...(folderId ? { folderId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapMediaAsset), total);
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
  assets(@WorkspaceId() workspaceId: string, @Query("folderId") folderId?: string) {
    return this.service.assets(workspaceId, folderId);
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
