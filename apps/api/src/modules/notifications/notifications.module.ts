import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Notification } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class NotificationsService {
  async list(_workspaceId: string): Promise<Notification[]> {
    return [];
  }

  async unreadCount(_workspaceId: string): Promise<number> {
    return 0;
  }
}

@ApiTags("notifications")
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
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
