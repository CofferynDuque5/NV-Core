import { Controller, Get, HttpCode, Module, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { MessagingModule } from "../messaging/messaging.module";
import { ProviderManager } from "./provider-manager";
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
  imports: [MessagingModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappGateway, ProviderManager],
  exports: [WhatsappService, ProviderManager],
})
export class WhatsappModule {}
