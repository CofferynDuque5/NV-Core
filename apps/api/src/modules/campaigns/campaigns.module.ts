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
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  CAMPAIGN_STATUSES,
  CHANNEL_IDS,
  type Campaign,
  type CampaignAttachment,
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
  Min,
  MinLength,
} from "class-validator";

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
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { CampaignRunner } from "./campaign-runner.service";

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
      this.prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" }, ...WITH_COUNT }),
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
  imports: [WhatsappModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignRunner],
  exports: [CampaignRunner],
})
export class CampaignsModule {}
