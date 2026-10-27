import { copyFile, mkdir, open as openFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BadRequestException,
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
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, MulterModule } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response as ExpressResponse } from "express";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import {
  MEDIA_TYPES,
  type MediaAsset,
  type MediaFolder,
  type MediaType,
  type MediaUploadSignature,
  type StoredFile,
  type UploadFileResult,
} from "@nv/domain";
import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

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
import { CredentialsModule, CredentialsService } from "../credentials/credentials.module";
import { Public } from "../../auth/decorators/public.decorator";
import { buildUploadSignature, parseCloudinaryUrl } from "./cloudinary";
import {
  CONTENT_TYPE_BY_EXT,
  STORED_NAME_RE,
  WORKSPACE_DIR_RE,
  displayName,
  fileSpec,
  publicFileUrl,
  resolveMediaDir,
  servesInline,
  storedFileName,
} from "./local-storage";
import { LIST_CAP } from "../../common/query-limits";

export class CreateFolderDto {
  @IsString() @MinLength(1) label!: string;
}

export class UploadImageDto {
  /** Base64 image (data: URL or raw base64). */
  @IsString() @MinLength(16) @MaxLength(15_000_000) image!: string;
}

export class CreateAssetDto {
  @IsIn(MEDIA_TYPES) type!: MediaType;
  @IsString() @MinLength(1) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() folderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional({ description: "URL https (p.ej. de Cloudinary)" })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https"] })
  url?: string;
}

/** Extra form fields sent with a server upload (multipart). */
export class UploadFileDto {
  @ApiPropertyOptional({ description: "Guardar también en la Biblioteca: true | false" })
  @IsOptional()
  @IsIn(["true", "false"])
  library?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() folderId?: string;
}

/** What multer hands over after writing the upload to a temp file. */
export interface UploadedDiskFile {
  path: string;
  size: number;
  mimetype: string;
  originalname: string;
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
    private readonly credentials: CredentialsService,
  ) {}

  /** ImgBB key for a workspace: pasted-in-app (DB) first, then server env. */
  private async imgbbKey(workspaceSlug: string): Promise<string | undefined> {
    const db = await this.credentials.get(workspaceSlug, "imgbb");
    return db.apiKey || this.config.get("integrations", { infer: true }).imgbb.apiKey;
  }

  private db() {
    if (!this.prisma.enabled)
      throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  /** Signed params for a direct browser→Cloudinary upload; null when unconfigured. */
  uploadSignature(workspaceId: string, folder?: string): MediaUploadSignature | null {
    const creds = parseCloudinaryUrl(
      this.config.get("integrations", { infer: true }).cloudinary.url,
    );
    if (!creds) return null;
    // Scope uploads to the workspace to keep tenants' media separate.
    const targetFolder = folder ? `nv-core/${workspaceId}/${folder}` : `nv-core/${workspaceId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = buildUploadSignature({ folder: targetFolder, timestamp }, creds.apiSecret);
    return {
      cloudName: creds.cloudName,
      apiKey: creds.apiKey,
      timestamp,
      signature,
      folder: targetFolder,
    };
  }

  /** Whether server-side ImgBB image hosting is configured. */
  imgbbConfigured(): boolean {
    return Boolean(this.config.get("integrations", { infer: true }).imgbb.apiKey);
  }

  /**
   * Upload a base64 image to ImgBB (server-side, key never leaves the backend)
   * and return its public URL. Images only — ImgBB does not host video.
   */
  async uploadImage(workspaceSlug: string, base64: string): Promise<{ url: string }> {
    const apiKey = await this.imgbbKey(workspaceSlug);
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "Hosting de imágenes no configurado. Añade tu clave de ImgBB en Integraciones (o define IMGBB_API_KEY / CLOUDINARY_URL).",
      );
    }
    // Accept a data: URL or a raw base64 payload.
    const payload = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
    let res: Response;
    try {
      res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ image: payload }).toString(),
      });
    } catch (e) {
      throw new ServiceUnavailableException(`ImgBB: red no disponible (${(e as Error).message}).`);
    }
    const data = (await res.json().catch(() => ({}))) as {
      data?: { url?: string; display_url?: string };
      error?: { message?: string };
    };
    if (!res.ok || !data.data?.url) {
      throw new ServiceUnavailableException(
        `ImgBB: ${data.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
    return { url: data.data.display_url || data.data.url };
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
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
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

  async createFolder(
    workspaceId: string,
    actor: string,
    dto: CreateFolderDto,
  ): Promise<MediaFolder> {
    const row = await this.db().mediaFolder.create({
      data: { workspaceSlug: workspaceId, label: dto.label },
      include: { _count: { select: { assets: true } } },
    });
    await this.audit.record(workspaceId, actor, "media.folder.create", row.id);
    return mapMediaFolder(row);
  }

  /** Ensure a folderId (when given) belongs to this workspace — never trust a
   * client-supplied id to point at a foreign tenant's folder. */
  private async assertOwnedFolder(workspaceId: string, folderId?: string | null): Promise<void> {
    if (!folderId) return;
    const folder = await this.db().mediaFolder.findFirst({
      where: { id: folderId, workspaceSlug: workspaceId },
      select: { id: true },
    });
    if (!folder) throw new NotFoundException("Carpeta no encontrada.");
  }

  /**
   * Keep an uploaded file on this server: checks type and content, moves it to
   * <MEDIA_DIR>/<workspace>/<random>.<ext> and returns its public URL.
   * Optionally also adds it to the Biblioteca.
   */
  async saveFile(
    workspaceId: string,
    actor: string,
    file: UploadedDiskFile | undefined,
    dto: UploadFileDto = {},
  ): Promise<UploadFileResult> {
    const media = this.config.get("media", { infer: true });
    if (!file) throw new BadRequestException("Falta el archivo.");
    try {
      if (!media.enabled) {
        throw new ServiceUnavailableException(
          "Almacenamiento en el servidor no configurado (MEDIA_STORAGE=off).",
        );
      }
      if (!WORKSPACE_DIR_RE.test(workspaceId)) throw new BadRequestException("Marca no válida.");
      const spec = fileSpec(file.mimetype);
      if (!spec) {
        throw new BadRequestException(
          "Tipo de archivo no permitido. Sube imágenes (JPG, PNG, WebP, GIF), video (MP4, MOV, WebM) o documentos (PDF, Word, Excel, PowerPoint, TXT, CSV).",
        );
      }
      if (file.size <= 0) throw new BadRequestException("El archivo está vacío.");
      if (!spec.sniff(await readHead(file.path))) {
        throw new BadRequestException("El contenido del archivo no coincide con su tipo.");
      }
      if (dto.library === "true") await this.assertOwnedFolder(workspaceId, dto.folderId);

      const root = resolveMediaDir(media.dir);
      await ensureStorageRoot(root);
      const dir = join(root, workspaceId);
      await mkdir(dir, { recursive: true });
      const name = storedFileName(spec.ext);
      await moveFile(file.path, join(dir, name));

      const stored: StoredFile = {
        url: publicFileUrl(media.publicBase, workspaceId, name),
        kind: spec.kind,
        mime: file.mimetype.toLowerCase(),
        filename: displayName(file.originalname, name),
        size: file.size,
      };
      await this.audit.record(workspaceId, actor, "media.file.upload", name);
      let asset: MediaAsset | null = null;
      if (dto.library === "true") {
        const row = await this.db().mediaAsset.create({
          data: {
            workspaceSlug: workspaceId,
            type: spec.kind,
            title: stored.filename,
            folderId: dto.folderId,
            url: stored.url,
          },
        });
        await this.audit.record(workspaceId, actor, "media.asset.create", row.id);
        asset = mapMediaAsset(row);
      }
      return { file: stored, asset };
    } finally {
      // The temp file is gone after a successful move; on any rejection drop it.
      await unlink(file.path).catch(() => undefined);
    }
  }

  /** Stream a stored file. Only names this server generated are served. */
  async serveFile(workspace: string, name: string, res: ExpressResponse): Promise<void> {
    const media = this.config.get("media", { infer: true });
    if (!WORKSPACE_DIR_RE.test(workspace) || !STORED_NAME_RE.test(name)) {
      throw new NotFoundException("Archivo no encontrado.");
    }
    const ext = name.slice(name.lastIndexOf(".") + 1);
    const type = CONTENT_TYPE_BY_EXT[ext];
    if (!type) throw new NotFoundException("Archivo no encontrado.");
    const full = join(resolveMediaDir(media.dir), workspace, name);
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("Archivo no encontrado.");

    res.setHeader("Content-Type", type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // The web app (other origin in dev) and Meta/WhatsApp must be able to load it.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Disposition", servesInline(ext) ? "inline" : "attachment");
    // PDFs need the browser viewer; everything else can't run anything.
    if (ext !== "pdf") res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    // Names are random and never reused, so the content never changes.
    res.sendFile(full, { maxAge: "365d", immutable: true, dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: "Archivo no encontrado." });
    });
  }

  async createAsset(workspaceId: string, actor: string, dto: CreateAssetDto): Promise<MediaAsset> {
    await this.assertOwnedFolder(workspaceId, dto.folderId);
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
    const existing = await this.db().mediaAsset.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    if (!existing) throw new NotFoundException("Archivo no encontrado.");
    if (dto.folderId) await this.assertOwnedFolder(workspaceId, dto.folderId);
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

  @Post("upload-image")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  uploadImage(@WorkspaceId() workspaceId: string, @Body() dto: UploadImageDto) {
    return this.service.uploadImage(workspaceId, dto.image);
  }

  @Post("upload")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(200)
  uploadFile(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedDiskFile | undefined,
    @Body() dto: UploadFileDto,
  ) {
    return this.service.saveFile(workspaceId, user.email, file, dto);
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

/**
 * Public file server for uploads kept on this server. No login: WhatsApp,
 * Instagram and Facebook fetch these URLs. Names are 128-bit random.
 */
@ApiTags("media")
@Public()
@SkipThrottle()
@Controller("files")
export class FilesController {
  constructor(private readonly service: MediaService) {}

  @Get(":workspace/:name")
  serve(@Param("workspace") workspace: string, @Param("name") name: string, @Res() res: ExpressResponse) {
    return this.service.serveFile(workspace, name, res);
  }
}

/**
 * Create the storage folder with an .htaccess that blocks direct web access:
 * on cPanel the app folder can be the site's web root, and files must only
 * come out through /api/files (with its safe headers).
 */
async function ensureStorageRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, ".htaccess"), "Require all denied\n", { flag: "wx" }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code !== "EEXIST") throw err;
    },
  );
}

/** First bytes of a file, for the content check. */
async function readHead(path: string): Promise<Buffer> {
  const handle = await openFile(path, "r");
  try {
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** rename(), or copy+delete when the temp folder is on another disk. */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await copyFile(from, to);
    await unlink(from);
  }
}

@Module({
  imports: [
    CredentialsModule,
    // Uploads stream to <MEDIA_DIR>/.tmp first (never held in memory), capped at MEDIA_MAX_MB.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const media = config.get("media", { infer: true });
        return {
          dest: join(resolveMediaDir(media.dir), ".tmp"),
          limits: { fileSize: media.maxBytes, files: 1, fields: 10 },
        };
      },
    }),
  ],
  controllers: [MediaController, FilesController],
  providers: [MediaService],
})
export class MediaModule {}
