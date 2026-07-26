import {
  Body,
  Controller,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { deliverMessage, isChannelConfigured, type OutboundMessage } from "./messaging.providers";

export class SendMessageDto {
  @IsString() channel!: string;
  @IsString() @MinLength(1) to!: string;
  @IsString() @MinLength(1) body!: string;
}

@Injectable()
export class MessagingService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private integrations() {
    return this.config.get("integrations", { infer: true });
  }

  /** True when the channel can deliver right now (provider configured). */
  isConfigured(channel: string): boolean {
    return isChannelConfigured(this.integrations(), channel);
  }

  /** Send through the channel provider; throws 503 when unconfigured/unsupported. */
  async send(_workspaceId: string, dto: OutboundMessage): Promise<{ id: string }> {
    if (!this.isConfigured(dto.channel)) {
      throw new ServiceUnavailableException(
        `Canal "${dto.channel}" sin proveedor configurado (WhatsApp / Telegram).`,
      );
    }
    try {
      return await deliverMessage(this.integrations(), dto);
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }
  }
}

@ApiTags("messaging")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/messaging")
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Post("send")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  send(@WorkspaceId() workspaceId: string, @Body() dto: SendMessageDto) {
    return this.service.send(workspaceId, dto);
  }
}

@Module({
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
