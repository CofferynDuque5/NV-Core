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
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(CAMPAIGN_STATUSES) status?: CampaignStatus;
  @IsOptional() @IsArray() @IsIn(CHANNEL_IDS, { each: true }) channels?: ChannelId[];
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsDateString() nextRunAt?: string;
  @IsOptional() @IsString() accent?: string;
}

const WITH_COUNT = { include: { _count: { select: { posts: true } } } } as const;

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

  async create(workspaceId: string, actor: string, dto: CreateCampaignDto): Promise<Campaign> {
    const row = await this.db().campaign.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        status: dto.status ?? "borrador",
        channels: dto.channels ?? [],
        progress: dto.progress ?? 0,
        nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : null,
        accent: dto.accent,
      },
      ...WITH_COUNT,
    });
    await this.audit.record(workspaceId, actor, "campaign.create", row.id);
    return mapCampaign(row);
  }

  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const existing = await this.db().campaign.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Campaña no encontrada.");
    const row = await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        channels: dto.channels,
        progress: dto.progress,
        nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
        accent: dto.accent,
      },
      ...WITH_COUNT,
    });
    await this.audit.record(workspaceId, actor, "campaign.update", id);
    return mapCampaign(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().campaign.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Campaña no encontrada.");
    await this.audit.record(workspaceId, actor, "campaign.delete", id);
  }
}

@ApiTags("campaigns")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/campaigns")
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
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
}

@Module({ controllers: [CampaignsController], providers: [CampaignsService] })
export class CampaignsModule {}
