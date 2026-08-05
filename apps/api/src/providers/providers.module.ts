import { Body, Controller, Get, HttpCode, Module, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsString } from "class-validator";

import { WorkspaceId } from "../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../common/tenant/workspace.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { WhatsappModule } from "../modules/whatsapp/whatsapp.module";
import { SocialModule } from "../modules/social/social.module";
import { MessagingModule } from "../modules/messaging/messaging.module";

import { ProviderManager } from "./provider-manager.service";
import { type ProviderId } from "./provider.types";
import {
  EmailProvider,
  FacebookProvider,
  InstagramProvider,
  TiktokProvider,
  WhatsappProvider,
} from "./providers";
import { WhatsappBaileysAdapter } from "./adapters/whatsapp-baileys.adapter";
import { WhatsappCloudApiAdapter } from "./adapters/whatsapp-cloud-api.adapter";
import {
  FacebookMetaGraphAdapter,
  InstagramMetaGraphAdapter,
} from "./adapters/meta-graph.adapter";
import {
  FacebookBrowserAutomationAdapter,
  InstagramBrowserAutomationAdapter,
} from "./adapters/browser-automation.adapter";
import { ResendAdapter } from "./adapters/resend.adapter";
import { TiktokOfficialApiAdapter } from "./adapters/tiktok-official-api.adapter";

class SelectAdapterDto {
  @IsString() adapter!: string;
}

@ApiTags("providers")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/providers")
export class ProvidersController {
  constructor(private readonly manager: ProviderManager) {}

  /** All providers with their adapters and the active selection. */
  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.manager.listProviders(workspaceId);
  }

  @Get(":provider")
  view(@WorkspaceId() workspaceId: string, @Param("provider") provider: ProviderId) {
    return this.manager.view(workspaceId, provider);
  }

  @Get(":provider/status")
  status(@WorkspaceId() workspaceId: string, @Param("provider") provider: ProviderId) {
    return this.manager.status(workspaceId, provider);
  }

  @Get(":provider/health")
  health(@WorkspaceId() workspaceId: string, @Param("provider") provider: ProviderId) {
    return this.manager.healthCheck(workspaceId, provider);
  }

  /** Choose the active adapter for a provider. */
  @Post(":provider/adapter")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  select(
    @WorkspaceId() workspaceId: string,
    @Param("provider") provider: ProviderId,
    @Body() dto: SelectAdapterDto,
  ) {
    return this.manager.setActiveAdapter(workspaceId, provider, dto.adapter);
  }
}

@Module({
  imports: [WhatsappModule, SocialModule, MessagingModule],
  controllers: [ProvidersController],
  providers: [
    ProviderManager,
    // Providers
    WhatsappProvider,
    FacebookProvider,
    InstagramProvider,
    EmailProvider,
    TiktokProvider,
    // Adapters
    WhatsappBaileysAdapter,
    WhatsappCloudApiAdapter,
    FacebookMetaGraphAdapter,
    InstagramMetaGraphAdapter,
    FacebookBrowserAutomationAdapter,
    InstagramBrowserAutomationAdapter,
    ResendAdapter,
    TiktokOfficialApiAdapter,
  ],
  exports: [ProviderManager],
})
export class ProvidersModule {}
