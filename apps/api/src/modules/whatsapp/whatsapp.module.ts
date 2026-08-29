import { Controller, Get, HttpCode, Module, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { NotificationsModule } from "../notifications/notifications.module";
import { WhatsappGateway } from "./whatsapp.gateway";
import { WhatsappService } from "./whatsapp.service";

@ApiTags("whatsapp")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/whatsapp")
export class WhatsappController {
  constructor(private readonly service: WhatsappService) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.service.status(workspaceId);
  }

  @Get("groups")
  groups(@WorkspaceId() workspaceId: string) {
    return this.service.listGroups(workspaceId);
  }

  @Post("connect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  connect(@WorkspaceId() workspaceId: string) {
    return this.service.connect(workspaceId);
  }

  @Post("reconnect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  reconnect(@WorkspaceId() workspaceId: string) {
    return this.service.reconnect(workspaceId);
  }

  @Post("disconnect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  disconnect(@WorkspaceId() workspaceId: string) {
    return this.service.disconnect(workspaceId);
  }

  @Post("sync")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  sync(@WorkspaceId() workspaceId: string) {
    return this.service.sync(workspaceId);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappGateway],
  exports: [WhatsappService],
})
export class WhatsappModule {}
