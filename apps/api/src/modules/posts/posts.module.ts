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
  Post as HttpPost,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  CHANNEL_IDS,
  POST_STATUSES,
  type ChannelId,
  type Post,
  type PostStatus,
} from "@nv/domain";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapPost } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PostScheduler } from "../scheduler/post-scheduler.service";

export class CreatePostDto {
  @IsIn(CHANNEL_IDS) channel!: ChannelId;
  @IsString() @MinLength(1) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() copy?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ enum: POST_STATUSES })
  @IsOptional()
  @IsIn(POST_STATUSES)
  status?: PostStatus;

  @ApiPropertyOptional({ description: "ISO date" })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;
}

const WITH_CAMPAIGN = { include: { campaign: { select: { name: true } } } } as const;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly scheduler: PostScheduler,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Post>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Post>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({ where, orderBy: { scheduledAt: "asc" }, ...WITH_CAMPAIGN }),
      this.prisma.post.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapPost), total);
  }

  async today(workspaceId: string): Promise<Post[]> {
    if (!this.prisma.enabled) return [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const rows = await this.prisma.post.findMany({
      where: { workspaceSlug: workspaceId, scheduledAt: { gte: start, lt: end } },
      orderBy: { scheduledAt: "asc" },
      ...WITH_CAMPAIGN,
    });
    return rows.map(mapPost);
  }

  async create(workspaceId: string, actor: string, dto: CreatePostDto): Promise<Post> {
    const row = await this.db().post.create({
      data: {
        workspaceSlug: workspaceId,
        channel: dto.channel,
        title: dto.title,
        copy: dto.copy,
        hashtags: dto.hashtags ?? [],
        status: dto.status ?? "draft",
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        campaignId: dto.campaignId,
      },
      ...WITH_CAMPAIGN,
    });
    await this.audit.record(workspaceId, actor, "post.create", row.id);

    // Hand scheduled posts to the background worker (no-op without Redis).
    if (row.status === "scheduled" && row.scheduledAt) {
      await this.scheduler.schedule(row.id, row.scheduledAt);
    }
    return mapPost(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().post.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Publicación no encontrada.");
    await this.scheduler.cancel(id);
    await this.audit.record(workspaceId, actor, "post.delete", id);
  }
}

@ApiTags("posts")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/posts")
export class PostsController {
  constructor(private readonly service: PostsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get("today")
  today(@WorkspaceId() workspaceId: string) {
    return this.service.today(workspaceId);
  }

  @HttpPost()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePostDto,
  ) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Delete(":id")
  @Roles("Owner", "Admin", "Editor")
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

@Module({ controllers: [PostsController], providers: [PostsService] })
export class PostsModule {}
