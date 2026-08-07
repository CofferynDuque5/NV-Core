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
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  CAMPAIGN_STATUSES,
  CHANNEL_IDS,
  type Campaign,
  type CampaignAttachment,
  type CampaignImportResult,
  type CampaignStatus,
  type ChannelId,
} from "@nv/domain";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { parseCsv, toCsv } from "../../common/csv";
import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapCampaign } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { ProvidersModule } from "../../providers/providers.module";
import { CampaignRunner } from "./campaign-runner.service";
import { LIST_CAP } from "../../common/query-limits";

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ enum: CAMPAIGN_STATUSES })
  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: CampaignStatus;

  @ApiPropertyOptional({ enum: CHANNEL_IDS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(CHANNEL_IDS, { each: true })
  channels?: ChannelId[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ description: "ISO date" })
  @IsOptional()
  @IsDateString()
  nextRunAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accent?: string;

  @ApiPropertyOptional({ description: "Cuerpo del mensaje (admite {{variables}})." })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ enum: ["once", "daily", "weekly"] })
  @IsOptional()
  @IsIn(["once", "daily", "weekly"])
  scheduleType?: "once" | "daily" | "weekly";

  @ApiPropertyOptional({ description: "once → ISO; daily/weekly → HH:MM" })
  @IsOptional()
  @IsString()
  scheduleAt?: string;

  @ApiPropertyOptional({ isArray: true, type: Number })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  scheduleDays?: number[];

  @ApiPropertyOptional({ isArray: true, type: Object })
  @IsOptional()
  @IsArray()
  attachments?: CampaignAttachment[];

  @ApiPropertyOptional({ enum: ["feed", "reel", "story", "carousel"] })
  @IsOptional()
  @IsIn(["feed", "reel", "story", "carousel"])
  socialFormat?: string;

  @ApiPropertyOptional({ isArray: true, type: String, description: "Ids de grupos objetivo" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetGroups?: string[];
}

export class ImportCampaignsDto {
  @IsString() @MaxLength(5_000_000) csv!: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(CAMPAIGN_STATUSES) status?: CampaignStatus;
  @IsOptional() @IsArray() @IsIn(CHANNEL_IDS, { each: true }) channels?: ChannelId[];
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsDateString() nextRunAt?: string;
  @IsOptional() @IsString() accent?: string;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsIn(["once", "daily", "weekly"]) scheduleType?: "once" | "daily" | "weekly";
  @IsOptional() @IsString() scheduleAt?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) scheduleDays?: number[];
  @IsOptional() @IsArray() attachments?: CampaignAttachment[];
  @IsOptional() @IsIn(["feed", "reel", "story", "carousel"]) socialFormat?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) targetGroups?: string[];
}

const WITH_COUNT = {
  include: { _count: { select: { posts: true } }, targets: { select: { groupId: true } } },
} as const;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Campaign>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Campaign>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP, ...WITH_COUNT }),
      this.prisma.campaign.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapCampaign), total);
  }

  async get(workspaceId: string, id: string): Promise<Campaign | null> {
    if (!this.prisma.enabled) return null;
    const row = await this.prisma.campaign.findFirst({
      where: { id, workspaceSlug: workspaceId },
      ...WITH_COUNT,
    });
    return row ? mapCampaign(row) : null;
  }

  /** Replace a campaign's target groups (validating they belong to the workspace). */
  private async setTargets(workspaceId: string, campaignId: string, groupIds: string[]): Promise<void> {
    await this.prisma.campaignTarget.deleteMany({ where: { campaignId } });
    if (!groupIds.length) return;
    const owned = await this.prisma.group.findMany({
      where: { id: { in: groupIds }, workspaceSlug: workspaceId },
      select: { id: true },
    });
    if (owned.length) {
      await this.prisma.campaignTarget.createMany({
        data: owned.map((g) => ({ campaignId, groupId: g.id })),
        skipDuplicates: true,
      });
    }
  }

  private scheduleData(dto: CreateCampaignDto | UpdateCampaignDto) {
    return {
      message: dto.message,
      scheduleType: dto.scheduleType,
      scheduleAt: dto.scheduleAt,
      scheduleDays: dto.scheduleDays,
      attachments: dto.attachments as object | undefined,
      socialFormat: dto.socialFormat,
    };
  }

  async create(workspaceId: string, actor: string, dto: CreateCampaignDto): Promise<Campaign> {
    const created = await this.db().campaign.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        status: dto.status ?? "borrador",
        channels: dto.channels ?? [],
        progress: dto.progress ?? 0,
        nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : null,
        accent: dto.accent,
        message: dto.message ?? "",
        scheduleType: dto.scheduleType ?? "once",
        scheduleAt: dto.scheduleAt,
        scheduleDays: dto.scheduleDays ?? [],
        attachments: (dto.attachments as object) ?? [],
        socialFormat: dto.socialFormat,
      },
    });
    if (dto.targetGroups) await this.setTargets(workspaceId, created.id, dto.targetGroups);
    await this.audit.record(workspaceId, actor, "campaign.create", created.id);
    const row = await this.prisma.campaign.findUnique({ where: { id: created.id }, ...WITH_COUNT });
    return mapCampaign(row!);
  }

  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const existing = await this.db().campaign.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Campaña no encontrada.");
    await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        channels: dto.channels,
        progress: dto.progress,
        nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
        accent: dto.accent,
        ...this.scheduleData(dto),
      },
    });
    if (dto.targetGroups) await this.setTargets(workspaceId, id, dto.targetGroups);
    await this.audit.record(workspaceId, actor, "campaign.update", id);
    const row = await this.prisma.campaign.findUnique({ where: { id }, ...WITH_COUNT });
    return mapCampaign(row!);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().campaign.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Campaña no encontrada.");
    await this.audit.record(workspaceId, actor, "campaign.delete", id);
  }

  /** Change status (pause/resume). */
  async setStatus(workspaceId: string, id: string, status: CampaignStatus): Promise<Campaign> {
    const existing = await this.db().campaign.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Campaña no encontrada.");
    await this.prisma.campaign.update({ where: { id }, data: { status } });
    const row = await this.prisma.campaign.findUnique({ where: { id }, ...WITH_COUNT });
    return mapCampaign(row!);
  }

  /** Send history for a workspace (most recent first), optionally by campaign. */
  async logs(workspaceId: string, campaignId?: string) {
    if (!this.prisma.enabled) return [];
    return this.prisma.sendLog.findMany({
      where: { workspaceSlug: workspaceId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  private static readonly EXPORT_COLUMNS = [
    "name",
    "status",
    "channels",
    "message",
    "scheduleType",
    "scheduleAt",
    "scheduleDays",
    "targets",
  ];

  /** Export campaigns as CSV. Recipients are the target group NAMES (portable). */
  async exportCsv(workspaceId: string): Promise<string> {
    const cols = CampaignsService.EXPORT_COLUMNS;
    if (!this.prisma.enabled) return toCsv([], cols);

    const groups = await this.prisma.group.findMany({
      where: { workspaceSlug: workspaceId },
      select: { id: true, name: true },
    });
    const nameById = new Map(groups.map((g) => [g.id, g.name] as const));

    const rows: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.campaign.findMany({
        where: { workspaceSlug: workspaceId },
        orderBy: { id: "asc" },
        take: 1000,
        include: { targets: { select: { groupId: true } } },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const c of batch) {
        const targetNames = c.targets
          .map((t) => nameById.get(t.groupId))
          .filter((n): n is string => Boolean(n));
        rows.push({
          name: c.name,
          status: c.status,
          channels: c.channels.join(";"),
          message: c.message,
          scheduleType: c.scheduleType,
          scheduleAt: c.scheduleAt ?? "",
          scheduleDays: c.scheduleDays.join(";"),
          targets: targetNames.join(";"),
        });
      }
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < 1000) break;
    }
    return toCsv(rows, cols);
  }

  /**
   * Import campaigns from CSV. Dedupes by name; resolves recipient group names
   * to this workspace's groups (missing ones are reported, campaign still
   * created). Imported campaigns are always created as drafts ("borrador") so an
   * import never auto-launches a campaign.
   */
  async importCsv(workspaceId: string, actor: string, csv: string): Promise<CampaignImportResult> {
    const db = this.db();
    const records = parseCsv(csv);
    const MAX = 2000;
    if (records.length > MAX) {
      throw new BadRequestException(`Máximo ${MAX} filas por importación (recibidas ${records.length}).`);
    }

    const [existing, groups] = await Promise.all([
      db.campaign.findMany({ where: { workspaceSlug: workspaceId }, select: { name: true } }),
      db.group.findMany({ where: { workspaceSlug: workspaceId }, select: { id: true, name: true } }),
    ]);
    const seen = new Set(existing.map((c) => c.name.toLowerCase()));
    const groupIdByName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id] as const));

    const pick = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        const v = r[k];
        if (v && v.trim()) return v.trim();
      }
      return "";
    };
    const splitList = (v: string) =>
      v
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter(Boolean);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const schedules = ["once", "daily", "weekly"];

    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      const line = i + 2; // +1 header, +1 to 1-index
      const name = pick(r, "name", "nombre");
      if (!name) {
        errors.push(`Fila ${line}: falta el nombre.`);
        continue;
      }
      const nameKey = name.toLowerCase();
      if (seen.has(nameKey)) {
        skipped++;
        continue;
      }

      const channels = splitList(pick(r, "channels", "canales")).filter((c): c is ChannelId =>
        (CHANNEL_IDS as readonly string[]).includes(c),
      );
      const scheduleTypeRaw = pick(r, "scheduleType", "programacion");
      const scheduleType = schedules.includes(scheduleTypeRaw) ? scheduleTypeRaw : "once";
      const scheduleDays = splitList(pick(r, "scheduleDays", "dias"))
        .map((d) => Number(d))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

      // Resolve recipient group names → ids; report any that don't exist here.
      const targetNames = splitList(pick(r, "targets", "grupos", "destinatarios"));
      const groupIds: string[] = [];
      const missing: string[] = [];
      for (const gn of targetNames) {
        const id = groupIdByName.get(gn.toLowerCase());
        if (id) groupIds.push(id);
        else missing.push(gn);
      }
      if (missing.length) {
        errors.push(`Fila ${line} ("${name}"): grupos no encontrados: ${missing.join(", ")}.`);
      }

      try {
        const campaign = await db.campaign.create({
          data: {
            workspaceSlug: workspaceId,
            name,
            status: "borrador", // never auto-launch an imported campaign
            channels,
            message: pick(r, "message", "mensaje"),
            scheduleType,
            scheduleAt: pick(r, "scheduleAt", "hora") || null,
            scheduleDays,
          },
        });
        if (groupIds.length) {
          await db.campaignTarget.createMany({
            data: groupIds.map((groupId) => ({ campaignId: campaign.id, groupId })),
            skipDuplicates: true,
          });
        }
        created++;
        seen.add(nameKey);
      } catch (err) {
        errors.push(`Fila ${line}: ${(err as Error).message}`);
      }
    }
    await this.audit.record(workspaceId, actor, "campaigns.import", `created=${created} skipped=${skipped}`);
    return { created, skipped, errors: errors.slice(0, 50) };
  }
}

@ApiTags("campaigns")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/campaigns")
export class CampaignsController {
  constructor(
    private readonly service: CampaignsService,
    private readonly runner: CampaignRunner,
  ) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get("logs")
  logs(@WorkspaceId() workspaceId: string) {
    return this.service.logs(workspaceId);
  }

  @Get("export")
  async export(@WorkspaceId() workspaceId: string): Promise<{ csv: string }> {
    return { csv: await this.service.exportCsv(workspaceId) };
  }

  @Post("import")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  importCsv(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportCampaignsDto,
  ) {
    return this.service.importCsv(workspaceId, user.email, dto.csv);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
  }

  @Get(":id/logs")
  campaignLogs(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.logs(workspaceId, id);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }

  @Delete(":id")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  remove(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(workspaceId, user.email, id);
  }

  @Post(":id/run")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async run(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    await this.runner.run(workspaceId, id);
    return this.service.get(workspaceId, id);
  }

  @Post(":id/pause")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  pause(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.setStatus(workspaceId, id, "pausada");
  }

  @Post(":id/resume")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  resume(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.setStatus(workspaceId, id, "programada");
  }
}

@Module({
  imports: [ProvidersModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignRunner],
  exports: [CampaignRunner],
})
export class CampaignsModule {}
