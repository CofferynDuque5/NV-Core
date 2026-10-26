import {
  Controller,
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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Notification } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapNotification } from "../../prisma/mappers";
import { LIST_CAP } from "../../common/query-limits";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

/** Workspace-wide notifications plus the ones addressed to this member. */
function visibleTo(workspaceId: string, viewer?: string) {
  return {
    workspaceSlug: workspaceId,
    OR: viewer ? [{ recipient: null }, { recipient: viewer.toLowerCase() }] : [{ recipient: null }],
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  /**
   * Record a notification (e.g. a channel disconnect alert). With `recipient`
   * only that member sees it. No-op without a DB.
   */
  async create(
    workspaceId: string,
    input: { type: Notification["type"]; title: string; meta?: string | null; recipient?: string | null },
  ): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.notification.create({
      data: {
        workspaceSlug: workspaceId,
        type: input.type,
        title: input.title,
        meta: input.meta ?? null,
        recipient: input.recipient ? input.recipient.toLowerCase() : null,
      },
    });
  }

  async list(workspaceId: string, viewer?: string): Promise<Notification[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.notification.findMany({
      where: visibleTo(workspaceId, viewer),
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
    });
    return rows.map(mapNotification);
  }

  async unreadCount(workspaceId: string, viewer?: string): Promise<number> {
    if (!this.prisma.enabled) return 0;
    return this.prisma.notification.count({ where: { ...visibleTo(workspaceId, viewer), read: false } });
  }

  async markRead(workspaceId: string, id: string, viewer?: string): Promise<Notification> {
    const existing = await this.db().notification.findFirst({
      where: { id, ...visibleTo(workspaceId, viewer) },
    });
    if (!existing) throw new NotFoundException("Notificación no encontrada.");
    const row = await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return mapNotification(row);
  }

  async markAllRead(workspaceId: string, viewer?: string): Promise<{ updated: number }> {
    const { count } = await this.db().notification.updateMany({
      where: { ...visibleTo(workspaceId, viewer), read: false },
      data: { read: true },
    });
    return { updated: count };
  }
}

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(workspaceId, user.email);
  }

  @Get("unread-count")
  async unreadCount(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return { count: await this.service.unreadCount(workspaceId, user.email) };
  }

  @Patch(":id/read")
  markRead(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.markRead(workspaceId, id, user.email);
  }

  @Post("read-all")
  @HttpCode(200)
  markAllRead(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.markAllRead(workspaceId, user.email);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
