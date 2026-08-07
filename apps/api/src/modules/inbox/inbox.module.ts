import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { CHANNEL_IDS, type ChannelId, type Conversation, type Message } from "@nv/domain";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";

import type { AppConfig } from "../../config/configuration";
import { ListResultDto } from "../../common/dto/list-result.dto";
import { LIST_CAP, THREAD_CAP } from "../../common/query-limits";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { WorkspaceRegistry } from "../../common/workspace-registry.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapConversation, mapMessage } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { ProviderManager } from "../../providers/provider-manager.service";
import { ProvidersModule } from "../../providers/providers.module";
import { EventBus } from "../../core/events/event-bus.service";
import {
  parseTelegramInbound,
  parseWhatsAppInbound,
  verifyMetaSignature,
  type InboundMessage,
} from "./inbound";

export class CreateConversationDto {
  @IsIn(CHANNEL_IDS) channel!: ChannelId;
  @IsString() @MinLength(1) contactName!: string;

  @ApiPropertyOptional({ description: "WhatsApp (E.164) o chat id de Telegram para envío saliente." })
  @IsOptional()
  @IsString()
  contactHandle?: string;
}

export class SendMessageDto {
  @IsString() @MinLength(1) text!: string;
}

export class UpdateConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @ApiPropertyOptional({ description: "Email del responsable; vacío o null para desasignar." })
  @IsOptional()
  @IsString()
  assignee?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderManager,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly registry: WorkspaceRegistry,
    private readonly events: EventBus,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  private async owned(workspaceId: string, id: string) {
    const conv = await this.db().conversation.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!conv) throw new NotFoundException("Conversación no encontrada.");
    return conv;
  }

  /**
   * Persist an inbound message: find (by channel + handle) or create its
   * conversation in the configured inbound workspace, then append it.
   * Best-effort — drops silently (with a log) when misconfigured.
   */
  async recordInbound(msg: InboundMessage): Promise<void> {
    const slug = this.config.get("inboundWorkspace", { infer: true });
    if (!slug) {
      this.logger.warn("Mensaje entrante ignorado: define INBOUND_WORKSPACE.");
      return;
    }
    if (!this.prisma.enabled) return;
    if (!(await this.registry.exists(slug))) {
      this.logger.warn(`Mensaje entrante ignorado: workspace "${slug}" no existe.`);
      return;
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: { workspaceSlug: slug, channel: msg.channel, contactHandle: msg.contactHandle },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          workspaceSlug: slug,
          channel: msg.channel,
          contactName: msg.contactName,
          contactHandle: msg.contactHandle,
        },
      });
    }
    await this.prisma.message.create({
      data: { conversationId: conversation.id, direction: "in", text: msg.text },
    });
    this.logger.log(`Mensaje entrante (${msg.channel}) de ${msg.contactHandle} → ${slug}.`);
    // Decouple: publish the domain event (n8n + other modules can react).
    this.events.emit("message.received", {
      workspaceSlug: slug,
      channel: msg.channel,
      contactHandle: msg.contactHandle,
      contactName: msg.contactName,
      text: msg.text,
    });
  }

  async conversations(workspaceId: string): Promise<ListResultDto<Conversation>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Conversation>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.conversation.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapConversation), total);
  }

  async messages(workspaceId: string, conversationId: string): Promise<Message[]> {
    if (!this.prisma.enabled) return [];
    // Return the most recent THREAD_CAP messages (a busy thread can be huge),
    // then restore chronological order for display.
    const rows = await this.prisma.message.findMany({
      where: { conversationId, conversation: { workspaceSlug: workspaceId } },
      orderBy: { createdAt: "desc" },
      take: THREAD_CAP,
    });
    return rows.reverse().map(mapMessage);
  }

  async createConversation(
    workspaceId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    const row = await this.db().conversation.create({
      data: {
        workspaceSlug: workspaceId,
        channel: dto.channel,
        contactName: dto.contactName,
        contactHandle: dto.contactHandle,
      },
    });
    return mapConversation(row);
  }

  async sendMessage(
    workspaceId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<Message> {
    const conv = await this.owned(workspaceId, conversationId);
    const row = await this.prisma.message.create({
      data: { conversationId, direction: "out", text: dto.text },
    });

    // Best-effort external delivery (Baileys when connected, else Cloud API).
    // Never blocks or fails the persisted reply.
    if (conv.contactHandle) {
      void this.providers
        .sendByChannel(workspaceId, conv.channel, conv.contactHandle, dto.text)
        .catch((err: unknown) =>
          this.logger.warn(`Outbound delivery failed for ${conversationId}: ${(err as Error).message}`),
        );
    }

    return mapMessage(row);
  }

  /** Partial triage update: resolve, assign (or unassign with ""/null), labels. */
  async updateConversation(
    workspaceId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<Conversation> {
    await this.owned(workspaceId, conversationId);
    const row = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.resolved !== undefined ? { resolved: dto.resolved } : {}),
        ...(dto.assignee !== undefined ? { assignee: dto.assignee ? dto.assignee : null } : {}),
        ...(dto.labels !== undefined ? { labels: dto.labels } : {}),
      },
    });
    return mapConversation(row);
  }
}

@ApiTags("inbox")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/inbox")
export class InboxController {
  constructor(private readonly service: InboxService) {}

  @Get("conversations")
  conversations(@WorkspaceId() workspaceId: string) {
    return this.service.conversations(workspaceId);
  }

  @Get("conversations/:id/messages")
  messages(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.messages(workspaceId, id);
  }

  @Post("conversations")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  createConversation(@WorkspaceId() workspaceId: string, @Body() dto: CreateConversationDto) {
    return this.service.createConversation(workspaceId, dto);
  }

  @Post("conversations/:id/messages")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  sendMessage(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.sendMessage(workspaceId, id, dto);
  }

  @Patch("conversations/:id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  updateConversation(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.service.updateConversation(workspaceId, id, dto);
  }
}

/** Inbound WhatsApp (Meta Cloud API) webhook. Register at {API_URL}/api/integrations/whatsapp/webhook. */
@ApiTags("inbox")
@Controller("integrations/whatsapp")
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly service: InboxService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Meta verification handshake: echo hub.challenge when the token matches. */
  @Public()
  @SkipThrottle()
  @Get("webhook")
  @ApiExcludeEndpoint()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ): void {
    const expected = this.config.get("integrations", { infer: true }).whatsapp.verifyToken;
    if (mode === "subscribe" && expected && token === expected) {
      res.status(200).send(challenge ?? "");
    } else {
      res.status(403).send("forbidden");
    }
  }

  @Public()
  @SkipThrottle()
  @Post("webhook")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async event(
    @Req() req: { rawBody?: Buffer },
    @Body() body: unknown,
    @Headers("x-hub-signature-256") signature?: string,
  ): Promise<{ received: true }> {
    // Fail-closed: reject any inbound payload whose Meta HMAC signature does not
    // match. Without this, a public endpoint would let anyone inject messages.
    const appSecret = this.config.get("integrations", { infer: true }).meta.appSecret;
    if (!verifyMetaSignature(req.rawBody, signature, appSecret)) {
      throw new ForbiddenException("Firma de webhook inválida.");
    }
    const messages = parseWhatsAppInbound(body);
    for (const msg of messages) {
      await this.service.recordInbound(msg).catch((err: unknown) =>
        this.logger.warn(`WhatsApp inbound falló: ${(err as Error).message}`),
      );
    }
    return { received: true };
  }
}

/** Inbound Telegram webhook. Register with setWebhook at {API_URL}/api/integrations/telegram/webhook. */
@ApiTags("inbox")
@Controller("integrations/telegram")
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly service: InboxService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @SkipThrottle()
  @Post("webhook")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async event(
    @Body() body: unknown,
    @Headers("x-telegram-bot-api-secret-token") secret?: string,
  ): Promise<{ received: true }> {
    const expected = this.config.get("integrations", { infer: true }).telegram.webhookSecret;
    if (expected && secret !== expected) {
      throw new ForbiddenException("Secret de webhook inválido.");
    }
    const msg = parseTelegramInbound(body);
    if (msg) {
      await this.service.recordInbound(msg).catch((err: unknown) =>
        this.logger.warn(`Telegram inbound falló: ${(err as Error).message}`),
      );
    }
    return { received: true };
  }
}

@Module({
  imports: [ProvidersModule],
  controllers: [InboxController, WhatsAppWebhookController, TelegramWebhookController],
  providers: [InboxService],
})
export class InboxModule {}
