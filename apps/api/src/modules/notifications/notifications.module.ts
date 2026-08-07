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

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<Notification[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.notification.findMany({
      where: { workspaceSlug: workspaceId },
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
    });
    return rows.map(mapNotification);
  }

  async unreadCount(workspaceId: string): Promise<number> {
    if (!this.prisma.enabled) return 0;
    return this.prisma.notification.count({ where: { workspaceSlug: workspaceId, read: false } });
  }

  async markRead(workspaceId: string, id: string): Promise<Notification> {
    const existing = await this.db().notification.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    if (!existing) throw new NotFoundException("Notificación no encontrada.");
    const row = await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return mapNotification(row);
  }

  async markAllRead(workspaceId: string): Promise<{ updated: number }> {
    const { count } = await this.db().notification.updateMany({
      where: { workspaceSlug: workspaceId, read: false },
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
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get("unread-count")
  async unreadCount(@WorkspaceId() workspaceId: string) {
    return { count: await this.service.unreadCount(workspaceId) };
  }

  @Patch(":id/read")
  markRead(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.markRead(workspaceId, id);
  }

  @Post("read-all")
  @HttpCode(200)
  markAllRead(@WorkspaceId() workspaceId: string) {
    return this.service.markAllRead(workspaceId);
  }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
