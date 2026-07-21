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
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  CHANNEL_IDS,
  CONNECTION_STATUSES,
  type ChannelId,
  type Connection,
  type ConnectionStatus,
} from "@nv/domain";
import { IsArray, IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapConnection } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

export class UpsertConnectionDto {
  @IsIn(CHANNEL_IDS) channel!: ChannelId;
  @IsString() @MinLength(1) handle!: string;

  @ApiPropertyOptional({ enum: CONNECTION_STATUSES })
  @IsOptional()
  @IsIn(CONNECTION_STATUSES)
  status?: ConnectionStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() token?: string;
  @ApiPropertyOptional({ description: "ISO date" }) @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() webhookStatus?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<Connection[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.connection.findMany({
      where: { workspaceSlug: workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapConnection);
  }

  async get(workspaceId: string, id: string): Promise<Connection | null> {
    if (!this.prisma.enabled) return null;
    const row = await this.prisma.connection.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    return row ? mapConnection(row) : null;
  }

  /** Connect/reconnect a channel (unique per workspace + channel). */
  async upsert(workspaceId: string, actor: string, dto: UpsertConnectionDto): Promise<Connection> {
    const data = {
      handle: dto.handle,
      status: dto.status ?? "ok",
      token: dto.token,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      webhookStatus: dto.webhookStatus,
      permissions: dto.permissions ?? [],
    };
    const row = await this.db().connection.upsert({
      where: { workspaceSlug_channel: { workspaceSlug: workspaceId, channel: dto.channel } },
      create: { workspaceSlug: workspaceId, channel: dto.channel, ...data },
      update: data,
    });
    await this.audit.record(workspaceId, actor, "connection.upsert", dto.channel);
    return mapConnection(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().connection.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Conexión no encontrada.");
    await this.audit.record(workspaceId, actor, "connection.delete", id);
  }
}

@ApiTags("connections")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/connections")
export class ConnectionsController {
  constructor(private readonly service: ConnectionsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
  }

  @Post()
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  upsert(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertConnectionDto,
  ) {
    return this.service.upsert(workspaceId, user.email, dto);
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

@Module({ controllers: [ConnectionsController], providers: [ConnectionsService] })
export class ConnectionsModule {}
