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
  type OnModuleInit,
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
import {
  CHANNEL_IDS,
  INBOX_UNASSIGNED,
  type ChannelId,
  type Conversation,
  type ConversationPage,
  type Message,
} from "@nv/domain";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

import type { AppConfig } from "../../config/configuration";
import { THREAD_CAP } from "../../common/query-limits";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { WorkspaceRegistry } from "../../common/workspace-registry.service";
import { safeEqual } from "../../common/crypto/crypto.util";
import { PrismaService } from "../../prisma/prisma.service";
import { mapConversation, mapMessage } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { ProviderManager } from "../../providers/provider-manager.service";
import { phoneKey } from "../consent/consent.service";
import { isBareName, isSampleContact, phoneFromHandle } from "./inbox-contacts";
import { ProvidersModule } from "../../providers/providers.module";
import { EventBus } from "../../core/events/event-bus.service";
import {
  ECHO_WINDOW_MS,
  parseTelegramInbound,
  parseWhatsAppInbound,
  verifyMetaSignature,
  type InboundMessage,
} from "./inbound";

/** Conversations per page when the client does not ask for a size. */
export const INBOX_PAGE_SIZE = 50;

export class ConversationsQueryDto {
  @ApiPropertyOptional({ description: "Busca en nombre, teléfono/chat, etiquetas y texto de los mensajes." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: CHANNEL_IDS })
  @IsOptional()
  @IsIn(CHANNEL_IDS)
  channel?: ChannelId;

  @ApiPropertyOptional({ enum: ["open", "resolved", "all"], default: "all" })
  @IsOptional()
  @IsIn(["open", "resolved", "all"])
  status?: "open" | "resolved" | "all";

  @ApiPropertyOptional({ description: `Email del responsable, o "${INBOX_UNASSIGNED}" para sin asignar.` })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  assignee?: string;

  @ApiPropertyOptional({ default: INBOX_PAGE_SIZE, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: "nextCursor de la página anterior." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

/** Opaque page cursor: the last row's activity time and id. */
export function encodeInboxCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeInboxCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const at = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  return Number.isNaN(at.getTime()) || !id ? null : { at, id };
}

/** Escape LIKE wildcards so a search for "50%" matches the literal text. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

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
export class InboxService implements OnModuleInit {
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

  /** Subscribe to live-session inbound (WhatsApp Baileys / Telegram user). */
  onModuleInit(): void {
    this.events.on("session.inbound", (p) => {
      void this.recordInboundFor(p.workspaceSlug, {
        channel: p.channel,
        contactHandle: p.contactHandle,
        contactName: p.contactName,
        text: p.text,
        direction: p.direction,
        at: p.at,
        externalId: p.externalId,
        history: p.history,
      }).catch((err: unknown) => this.logger.warn(`Mensaje no guardado: ${(err as Error).message}`));
    });
    this.events.on("session.contact-names", (p) => {
      void this.applyContactNames(p.workspaceSlug, p.channel, p.names).catch((err: unknown) =>
        this.logger.warn(`Nombres de contactos no aplicados: ${(err as Error).message}`),
      );
    });
  }

  /**
   * Persist an inbound message from a webhook: routes to the configured
   * INBOUND_WORKSPACE. Best-effort — drops silently (with a log) when misconfigured.
   */
  async recordInbound(msg: InboundMessage): Promise<void> {
    const slug = this.config.get("inboundWorkspace", { infer: true });
    if (!slug) {
      this.logger.warn("Mensaje entrante ignorado: define INBOUND_WORKSPACE.");
      return;
    }
    await this.recordInboundFor(slug, msg);
  }

  /**
   * Persist a chat message into an EXPLICIT workspace: find (by channel +
   * handle) or create its conversation, then append it with its real date.
   * Used by live sessions (Baileys/Telegram) which already know their
   * workspace. A message seen before (same platform id, or the echo of a reply
   * sent from the panel) is stored once. Only NEW messages from the contact
   * count as "message.received" (automations, AI replies, opt-outs); history
   * and messages sent from the phone are just stored.
   */
  async recordInboundFor(slug: string, msg: InboundMessage): Promise<void> {
    if (!this.prisma.enabled) return;
    if (!(await this.registry.exists(slug))) {
      this.logger.warn(`Mensaje entrante ignorado: workspace "${slug}" no existe.`);
      return;
    }
    const direction = msg.direction ?? "in";
    const at = msg.at ?? new Date();
    const fromContact = direction === "in" && !isBareName(msg.contactName, msg.contactHandle);

    // WhatsApp chats become CRM contacts (and take their name from the CRM).
    const contact =
      msg.channel === "wa" && direction === "in"
        ? await this.ensureContact(slug, msg.contactHandle, fromContact ? msg.contactName : null, at)
        : null;
    const bestName = fromContact ? msg.contactName : (contact?.name ?? null);

    let conversation = await this.prisma.conversation.findFirst({
      where: { workspaceSlug: slug, channel: msg.channel, contactHandle: msg.contactHandle },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          workspaceSlug: slug,
          channel: msg.channel,
          contactName: bestName ?? msg.contactName ?? msg.contactHandle,
          contactHandle: msg.contactHandle,
        },
      });
    } else if (bestName && isBareName(conversation.contactName, conversation.contactHandle)) {
      // The chat was created with the number: now the real name is known.
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { contactName: bestName },
      });
    }

    if (await this.alreadyStored(conversation.id, direction, msg.text, at, msg.externalId)) return;
    try {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction,
          text: msg.text,
          externalId: msg.externalId ?? null,
          createdAt: at,
        },
      });
    } catch (err) {
      // Same message delivered twice at once (history + live): keep one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
      throw err;
    }
    if (direction !== "in" || msg.history) return;
    this.logger.log(`Mensaje entrante (${msg.channel}) de ${msg.contactHandle} → ${slug}.`);
    // Decouple: publish the domain event (n8n + other modules can react).
    this.events.emit("message.received", {
      workspaceSlug: slug,
      channel: msg.channel,
      contactHandle: msg.contactHandle,
      contactName: conversation.contactName,
      text: msg.text,
    });
  }

  /**
   * Was this message stored already? By platform id when there is one; for
   * messages we sent, also the echo of a reply typed in the panel (same text,
   * sent within two minutes), which comes back from WhatsApp with its own id.
   */
  private async alreadyStored(
    conversationId: string,
    direction: "in" | "out",
    text: string,
    at: Date,
    externalId?: string | null,
  ): Promise<boolean> {
    if (externalId) {
      const seen = await this.prisma.message.findFirst({ where: { conversationId, externalId }, select: { id: true } });
      if (seen) return true;
    }
    if (direction !== "out") return false;
    const echo = await this.prisma.message.findFirst({
      where: {
        conversationId,
        direction: "out",
        text,
        createdAt: { gte: new Date(at.getTime() - ECHO_WINDOW_MS), lte: new Date(at.getTime() + ECHO_WINDOW_MS) },
      },
      select: { id: true, externalId: true },
    });
    if (echo && externalId && !echo.externalId) {
      await this.prisma.message.update({ where: { id: echo.id }, data: { externalId } }).catch(() => undefined);
    }
    return Boolean(echo);
  }

  /**
   * The CRM contact for a WhatsApp number: found by phone, or created as a
   * Lead tagged «whatsapp». A real name replaces one that was only the number.
   * The old example contacts are never linked (their numbers may be real).
   */
  private async ensureContact(slug: string, handle: string, name: string | null, at: Date) {
    const key = phoneKey(handle);
    const phone = phoneFromHandle(handle);
    if (!key || !phone) return null;
    const candidates = await this.prisma.contact.findMany({
      where: { workspaceSlug: slug, phone: { contains: key.slice(-2) } },
      orderBy: { createdAt: "asc" },
    });
    const matches = candidates.filter((c) => phoneKey(c.phone) === key && !isSampleContact(c.name, c.phone));
    const found = matches[0];
    if (found) {
      if (name && isBareName(found.name)) {
        return this.prisma.contact.update({ where: { id: found.id }, data: { name } });
      }
      return found;
    }
    return this.prisma.contact.create({
      data: {
        workspaceSlug: slug,
        name: name ?? phone,
        phone,
        tags: ["whatsapp"],
        stage: "Lead",
        lastContactAt: at,
      },
    });
  }

  /** Names from the WhatsApp contact list → chats and contacts that only showed the number. */
  async applyContactNames(slug: string, channel: "wa" | "tg", names: { handle: string; name: string }[]): Promise<number> {
    if (!this.prisma.enabled || !names.length) return 0;
    const byHandle = new Map(names.filter((n) => !isBareName(n.name)).map((n) => [n.handle, n.name]));
    if (!byHandle.size) return 0;
    const convs = await this.prisma.conversation.findMany({
      where: { workspaceSlug: slug, channel, contactHandle: { in: [...byHandle.keys()] } },
      select: { id: true, contactName: true, contactHandle: true },
    });
    let updated = 0;
    for (const c of convs) {
      const name = byHandle.get(c.contactHandle ?? "");
      if (!name || !isBareName(c.contactName, c.contactHandle)) continue;
      await this.prisma.conversation.update({ where: { id: c.id }, data: { contactName: name } });
      updated++;
      if (channel !== "wa") continue;
      const key = phoneKey(c.contactHandle);
      if (!key) continue;
      const contacts = await this.prisma.contact.findMany({
        where: { workspaceSlug: slug, phone: { contains: key.slice(-2) } },
        select: { id: true, name: true, phone: true },
      });
      for (const ct of contacts) {
        if (phoneKey(ct.phone) === key && isBareName(ct.name)) {
          await this.prisma.contact.update({ where: { id: ct.id }, data: { name } });
        }
      }
    }
    return updated;
  }

  /**
   * One page of the workspace's conversations, newest activity first (last
   * message, or creation when empty). Search and filters run in the database,
   * so a large inbox never has to be loaded whole to find a thread.
   */
  async conversations(
    workspaceId: string,
    query: ConversationsQueryDto = {},
  ): Promise<ConversationPage> {
    if (!this.prisma.enabled) return { items: [], total: 0, nextCursor: null, openCount: 0 };
    const limit = query.limit ?? INBOX_PAGE_SIZE;
    const filters: Prisma.Sql[] = [Prisma.sql`c."workspaceSlug" = ${workspaceId}`];
    if (query.channel) filters.push(Prisma.sql`c."channel"::text = ${query.channel}`);
    if (query.status === "open") filters.push(Prisma.sql`c."resolved" = false`);
    if (query.status === "resolved") filters.push(Prisma.sql`c."resolved" = true`);
    if (query.assignee === INBOX_UNASSIGNED) filters.push(Prisma.sql`c."assignee" IS NULL`);
    else if (query.assignee) filters.push(Prisma.sql`c."assignee" = ${query.assignee}`);
    const q = query.q?.trim();
    if (q) {
      const p = likePattern(q);
      filters.push(Prisma.sql`(
        c."contactName" ILIKE ${p}
        OR c."contactHandle" ILIKE ${p}
        OR EXISTS (SELECT 1 FROM unnest(c."labels") l WHERE l ILIKE ${p})
        OR EXISTS (SELECT 1 FROM "Message" mq WHERE mq."conversationId" = c."id" AND mq."text" ILIKE ${p})
      )`);
    }
    const where = Prisma.join(filters, " AND ");
    const cursor = decodeInboxCursor(query.cursor);
    const activity = Prisma.sql`COALESCE(lm."last", c."createdAt")`;
    const after = cursor ? Prisma.sql`AND (${activity}, c."id") < (${cursor.at}, ${cursor.id})` : Prisma.empty;

    // One extra row tells whether another page exists.
    const [page, counts] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; activity: Date }[]>(Prisma.sql`
        SELECT c."id", ${activity} AS "activity"
        FROM "Conversation" c
        LEFT JOIN LATERAL (
          SELECT MAX(m."createdAt") AS "last" FROM "Message" m WHERE m."conversationId" = c."id"
        ) lm ON TRUE
        WHERE ${where} ${after}
        ORDER BY ${activity} DESC, c."id" DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ total: bigint; open: bigint }[]>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "Conversation" c WHERE ${where}) AS "total",
          (SELECT COUNT(*) FROM "Conversation" WHERE "workspaceSlug" = ${workspaceId} AND "resolved" = false) AS "open"
      `),
    ]);
    const more = page.length > limit;
    const ids = page.slice(0, limit).map((r) => r.id);
    const rows = ids.length
      ? await this.prisma.conversation.findMany({
          where: { workspaceSlug: workspaceId, id: { in: ids } },
          // Newest message per thread → preview + "last activity".
          include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
        })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => mapConversation(r, r.messages[0]));
    const last = page[limit - 1];
    return {
      items,
      total: Number(counts[0]?.total ?? 0),
      openCount: Number(counts[0]?.open ?? 0),
      nextCursor: more && last ? encodeInboxCursor(new Date(last.activity), last.id) : null,
    };
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
  conversations(@WorkspaceId() workspaceId: string, @Query() query: ConversationsQueryDto) {
    return this.service.conversations(workspaceId, query);
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
    if (mode === "subscribe" && expected && safeEqual(token, expected)) {
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
    // Fail-closed: reject unless a secret is configured AND matches. An
    // unconfigured webhook must never accept spoofed inbound updates. Same
    // generic 403 for both cases so it isn't an oracle for "is it configured".
    const expected = this.config.get("integrations", { infer: true }).telegram.webhookSecret;
    if (!expected || !safeEqual(secret, expected)) {
      throw new ForbiddenException("Webhook de Telegram no configurado o secret inválido.");
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
