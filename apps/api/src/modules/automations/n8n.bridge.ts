import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  HttpCode,
  Injectable,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { Public } from "../../auth/decorators/public.decorator";
import { JobManager } from "../../core/jobs/job-manager.service";
import { OutboundDispatcher } from "../../providers/outbound-dispatcher.service";
import { PROVIDER_IDS, type ProviderId } from "../../providers/provider.types";

/**
 * Authorizes inbound calls from n8n via a shared secret (X-N8N-Secret).
 * Closed by default: if N8N_INBOUND_SECRET is unset, every call is rejected.
 */
@Injectable()
export class N8nSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get("integrations", { infer: true }).n8n.inboundSecret;
    if (!secret) throw new ForbiddenException("Bridge de n8n deshabilitado (sin N8N_INBOUND_SECRET).");
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header("x-n8n-secret");
    if (provided !== secret) throw new ForbiddenException("Secreto de n8n inválido.");
    return true;
  }
}

class BridgeSendMessageDto {
  @IsString() @MinLength(1) workspaceSlug!: string;
  @IsString() @MinLength(1) channel!: string;
  @IsString() @MinLength(1) to!: string;
  @IsString() @MinLength(1) body!: string;
}

class BridgePublishDto {
  @IsString() @MinLength(1) workspaceSlug!: string;
  @IsIn(PROVIDER_IDS) provider!: ProviderId;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsArray() attachments?: { url: string; kind?: string }[];
  @IsOptional() @IsString() format?: string;
}

class BridgeRunCampaignDto {
  @IsString() @MinLength(1) workspaceSlug!: string;
  @IsString() @MinLength(1) campaignId!: string;
}

/**
 * n8n → backend action bridge. n8n workflows call these endpoints to make the
 * backend act (send a message, publish, run a campaign). Every action is
 * dispatched as a Job (async, retried, tracked) and routed through the
 * ProviderManager — n8n orchestrates, the backend executes.
 */
@ApiExcludeController()
@Controller("automation/actions")
export class AutomationBridgeController {
  constructor(
    private readonly dispatcher: OutboundDispatcher,
    private readonly jobs: JobManager,
  ) {}

  @Public()
  @SkipThrottle()
  @UseGuards(N8nSecretGuard)
  @Post("send-message")
  @HttpCode(202)
  async sendMessage(@Body() dto: BridgeSendMessageDto) {
    const jobId = await this.dispatcher.dispatchMessage(dto.workspaceSlug, dto.channel, dto.to, dto.body);
    return { accepted: true, jobId };
  }

  @Public()
  @SkipThrottle()
  @UseGuards(N8nSecretGuard)
  @Post("publish")
  @HttpCode(202)
  async publish(@Body() dto: BridgePublishDto) {
    const jobId = await this.dispatcher.dispatchPublish(dto.workspaceSlug, dto.provider, {
      message: dto.message,
      attachments: dto.attachments,
      format: dto.format ?? null,
    });
    return { accepted: true, jobId };
  }

  @Public()
  @SkipThrottle()
  @UseGuards(N8nSecretGuard)
  @Post("run-campaign")
  @HttpCode(202)
  async runCampaign(@Body() dto: BridgeRunCampaignDto) {
    const jobId = await this.jobs.dispatch("campaign.run", dto.workspaceSlug, {
      workspaceSlug: dto.workspaceSlug,
      campaignId: dto.campaignId,
    });
    return { accepted: true, jobId };
  }
}
