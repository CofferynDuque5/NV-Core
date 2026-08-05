import { Body, Controller, Module, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { ProviderManager } from "../../providers/provider-manager.service";
import { ProvidersModule } from "../../providers/providers.module";

export class SendMessageDto {
  @IsString() channel!: string;
  @IsString() @MinLength(1) to!: string;
  @IsString() @MinLength(1) body!: string;
}

/**
 * Direct outbound messaging. Delivery goes through the ProviderManager (the
 * single entry point to every external provider) — this module no longer calls
 * any messaging API directly.
 */
@ApiTags("messaging")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/messaging")
export class MessagingController {
  constructor(private readonly providers: ProviderManager) {}

  @Post("send")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  send(@WorkspaceId() workspaceId: string, @Body() dto: SendMessageDto) {
    return this.providers.sendByChannel(workspaceId, dto.channel, dto.to, dto.body);
  }
}

@Module({
  imports: [ProvidersModule],
  controllers: [MessagingController],
})
export class MessagingModule {}
