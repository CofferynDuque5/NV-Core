import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { EventBus } from "../../core/events/event-bus.service";
import { NotificationsService } from "../notifications/notifications.module";
import { TelegramGateway } from "./telegram.gateway";
import { TelegramSessionStore } from "./telegram-session.store";
import { TelegramUserSession } from "./telegram-user.session";
import type {
  TelegramAttachment,
  TelegramDialog,
  TelegramSessionEvents,
  TelegramStatus,
  TelegramStatusValue,
} from "./telegram.types";

/**
 * Per-workspace Telegram (MTProto/user) sessions, mirroring WhatsappService.
 * Login is by QR (the account, not a bot), so campaigns can broadcast to every
 * group and channel the account belongs to — imported automatically on sync.
 * No-op when TELEGRAM_API_ID / TELEGRAM_API_HASH are not configured.
 */
@Injectable()
export class TelegramUserService implements TelegramSessionEvents, OnModuleInit {
  private readonly store: TelegramSessionStore;
  private readonly apiId?: number;
  private readonly apiHash?: string;
  private readonly live = new Map<string, TelegramUserSession>();

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGateway,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
  ) {
    const integrations = config.get("integrations", { infer: true });
    this.apiId = integrations.telegram.apiId;
    this.apiHash = integrations.telegram.apiHash;
    this.store = new TelegramSessionStore(integrations.telegramSessionDir);
  }

  get configured(): boolean {
    return Boolean(this.apiId && this.apiHash);
  }

  async onModuleInit(): Promise<void> {
    if (!this.configured) return;
    for (const slug of this.store.listSessions()) {
      void this.getOrCreate(slug)
        .start()
        .catch(() => undefined); // resume best-effort; errors surface on manual connect
    }
  }

  private getOrCreate(workspaceSlug: string): TelegramUserSession {
    let session = this.live.get(workspaceSlug);
    if (!session) {
      session = new TelegramUserSession(workspaceSlug, this.apiId!, this.apiHash!, this.store, this);
      this.live.set(workspaceSlug, session);
    }
    return session;
  }

  // ── TelegramSessionEvents ────────────────────────────────────────────────
  onQr(workspaceSlug: string, dataUrl: string): void {
    this.gateway.emitQr(workspaceSlug, dataUrl);
  }

  onStatus(workspaceSlug: string, status: TelegramStatusValue): void {
    void this.persist(workspaceSlug, { status }).then(() => this.emit(workspaceSlug));
  }

  onMeta(
    workspaceSlug: string,
    meta: { username?: string | null; phone?: string | null; groupsCount?: number; connectedAt?: Date },
  ): void {
    void this.persist(workspaceSlug, {
      username: meta.username ?? undefined,
      phone: meta.phone ?? undefined,
      groupsCount: meta.groupsCount,
      lastConnectionAt: meta.connectedAt,
    }).then(() => this.emit(workspaceSlug));
  }

  onDialogs(workspaceSlug: string, dialogs: TelegramDialog[]): void {
    void this.persistDialogs(workspaceSlug, dialogs);
  }

  /** A direct inbound message → publish for the Inbox to persist (decoupled). */
  onInbound(
    workspaceSlug: string,
    msg: { contactHandle: string; contactName: string; text: string },
  ): void {
    this.events.emit("session.inbound", { workspaceSlug, channel: "tg", ...msg });
  }

  /** A connection problem → persist a notification and push the live status. */
  onAlert(workspaceSlug: string, alert: { level: "warning" | "error"; reason: string }): void {
    void this.notifications.create(workspaceSlug, {
      type: alert.level === "error" ? "error" : "warning",
      title: `Telegram: ${alert.reason}`,
      meta: "telegram",
    });
    void this.emit(workspaceSlug);
  }

  private async persistDialogs(workspaceSlug: string, dialogs: TelegramDialog[]): Promise<void> {
    if (!this.prisma.enabled || !dialogs.length) return;
    for (const d of dialogs) {
      await this.prisma.group.upsert({
        where: { workspaceSlug_remoteJid: { workspaceSlug, remoteJid: d.remoteJid } },
        create: {
          workspaceSlug,
          remoteJid: d.remoteJid,
          name: d.title,
          members: d.members,
          channel: "tg",
          kind: d.kind,
          synced: true,
        },
        update: { name: d.title, members: d.members, kind: d.kind, synced: true },
      });
    }
  }

  private async persist(
    workspaceSlug: string,
    data: {
      status?: TelegramStatusValue;
      username?: string;
      phone?: string;
      groupsCount?: number;
      lastConnectionAt?: Date;
    },
  ): Promise<void> {
    if (!this.prisma.enabled) return;
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await this.prisma.telegramSession.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, ...clean },
      update: clean,
    });
  }

  private async emit(workspaceSlug: string): Promise<void> {
    this.gateway.emitStatus(workspaceSlug, await this.status(workspaceSlug));
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async status(workspaceSlug: string): Promise<TelegramStatus> {
    const row =
      this.prisma.enabled && this.configured
        ? await this.prisma.telegramSession.findUnique({ where: { workspaceSlug } })
        : null;
    const session = this.live.get(workspaceSlug);
    const live = session?.currentStatus;
    return {
      status: live ?? (row?.status as TelegramStatusValue) ?? "disconnected",
      provider: "mtproto",
      username: row?.username ?? null,
      phone: row?.phone ?? null,
      lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
      groupsCount: row?.groupsCount ?? 0,
      error: session?.lastError ?? null,
    };
  }

  async connect(workspaceSlug: string): Promise<TelegramStatus> {
    if (!this.configured) {
      throw new Error(
        "Telegram (cuenta) no configurado. Define TELEGRAM_API_ID y TELEGRAM_API_HASH (my.telegram.org).",
      );
    }
    await this.getOrCreate(workspaceSlug).start();
    return this.status(workspaceSlug);
  }

  reconnect(workspaceSlug: string): Promise<TelegramStatus> {
    return this.connect(workspaceSlug);
  }

  async disconnect(workspaceSlug: string): Promise<TelegramStatus> {
    await this.live.get(workspaceSlug)?.logout();
    this.live.delete(workspaceSlug);
    await this.persist(workspaceSlug, { status: "disconnected", username: undefined, phone: undefined, groupsCount: 0 });
    return this.status(workspaceSlug);
  }

  async sync(workspaceSlug: string): Promise<TelegramStatus> {
    await this.live.get(workspaceSlug)?.sync();
    return this.status(workspaceSlug);
  }

  /** Provide the 2FA password when a QR sign-in is waiting for it. */
  async submitPassword(workspaceSlug: string, password: string): Promise<TelegramStatus> {
    const session = this.live.get(workspaceSlug);
    if (!session) throw new Error("No hay una conexión de Telegram en curso en este workspace.");
    session.submitPassword(password);
    return this.status(workspaceSlug);
  }

  isConnected(workspaceSlug: string): boolean {
    return this.live.get(workspaceSlug)?.isConnected ?? false;
  }

  sendText(workspaceSlug: string, to: string, text: string): Promise<{ id: string }> {
    const session = this.live.get(workspaceSlug);
    if (!session?.isConnected) throw new Error("Telegram (cuenta) no está conectado en este workspace.");
    return session.sendText(to, text);
  }

  sendMedia(
    workspaceSlug: string,
    to: string,
    text: string,
    attachment?: TelegramAttachment | null,
  ): Promise<{ id: string }> {
    const session = this.live.get(workspaceSlug);
    if (!session?.isConnected) throw new Error("Telegram (cuenta) no está conectado en este workspace.");
    return session.sendMedia(to, text, attachment);
  }
}
