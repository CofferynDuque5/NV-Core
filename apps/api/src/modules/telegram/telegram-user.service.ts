import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { EventBus } from "../../core/events/event-bus.service";
import { CredentialsService } from "../credentials/credentials.module";
import { NotificationsService } from "../notifications/notifications.module";
import { WorkspaceAccessService } from "../../common/access/workspace-access.service";
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

/** Most Telegram accounts one brand can link at once. */
export const MAX_TG_LINES = 5;

/**
 * Session key of a brand's Telegram account: line 1 keeps the brand slug (so
 * existing sessions keep working), other accounts are «<slug>__t<line>».
 */
export function tgLineKey(workspaceSlug: string, line = 1): string {
  return line > 1 ? `${workspaceSlug}__t${line}` : workspaceSlug;
}

export function parseTgLineKey(key: string): { workspaceSlug: string; line: number } {
  const m = /^(.+)__t(\d+)$/.exec(key);
  return m ? { workspaceSlug: m[1]!, line: Number(m[2]) } : { workspaceSlug: key, line: 1 };
}

/**
 * Per-workspace Telegram (MTProto/user) sessions, mirroring WhatsappService:
 * one brand can link several accounts (lines). Login is by QR (the account,
 * not a bot), so campaigns can broadcast to every group and channel each
 * account belongs to — imported automatically on sync, and sent from the
 * account that is in the group. No-op without TELEGRAM_API_ID / API_HASH.
 */
/** How often the watchdog re-checks dropped sessions (ms). */
const TG_WATCHDOG_INTERVAL_MS = 3 * 60_000;

const NOT_CONFIGURED =
  "Telegram (cuenta) no configurado. Añade tu API ID y API Hash (gratis en " +
  "my.telegram.org) en Integraciones → Telegram y pulsa Conectar.";

@Injectable()
export class TelegramUserService implements TelegramSessionEvents, OnModuleInit, OnModuleDestroy {
  private readonly store: TelegramSessionStore;
  private readonly apiId?: number;
  private readonly apiHash?: string;
  /** Live sessions by key (see tgLineKey). */
  private readonly live = new Map<string, TelegramUserSession>();
  /** Last QR of each key, so extra accounts can show it over HTTP. */
  private readonly qrs = new Map<string, string>();
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGateway,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
    private readonly credentials: CredentialsService,
    @Optional() private readonly access?: WorkspaceAccessService,
  ) {
    const integrations = config.get("integrations", { infer: true });
    this.apiId = integrations.telegram.apiId;
    this.apiHash = integrations.telegram.apiHash;
    this.store = new TelegramSessionStore(integrations.telegramSessionDir);
  }

  /** True when API credentials exist in the server env (global fallback). */
  get configured(): boolean {
    return Boolean(this.apiId && this.apiHash);
  }

  /**
   * Effective API_ID / API_HASH for a workspace: pasted-in-app (DB) first, then
   * the server env fallback. `null` when neither is set (→ actionable error).
   * Every account of the brand uses the same API app.
   */
  private async resolveCreds(
    workspaceSlug: string,
  ): Promise<{ apiId: number; apiHash: string } | null> {
    const db = await this.credentials.get(workspaceSlug, "telegram");
    const apiId = db.apiId ? Number(db.apiId) : this.apiId;
    const apiHash = db.apiHash || this.apiHash;
    if (!apiId || Number.isNaN(apiId) || !apiHash) return null;
    return { apiId, apiHash };
  }

  async onModuleInit(): Promise<void> {
    for (const key of this.store.listSessions()) {
      const creds = await this.resolveCreds(parseTgLineKey(key).workspaceSlug);
      if (!creds) continue;
      void this.getOrCreate(key, creds)
        .start()
        .catch(() => undefined); // resume best-effort; errors surface on manual connect
    }
    // Vigilante: re-levanta sesiones caídas que aún tienen credenciales (tras
    // reinicios del hosting o caídas silenciosas), sin pedir un QR nuevo.
    this.watchdog = setInterval(() => void this.sweep(), TG_WATCHDOG_INTERVAL_MS);
    this.watchdog.unref?.();
  }

  onModuleDestroy(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private async sweep(): Promise<void> {
    for (const key of this.store.listSessions()) {
      const creds = await this.resolveCreds(parseTgLineKey(key).workspaceSlug);
      if (creds) this.getOrCreate(key, creds).ensureAlive();
    }
  }

  private getOrCreate(key: string, creds: { apiId: number; apiHash: string }): TelegramUserSession {
    let session = this.live.get(key);
    if (!session) {
      session = new TelegramUserSession(key, creds.apiId, creds.apiHash, this.store, this);
      this.live.set(key, session);
    }
    return session;
  }

  /** Account numbers a brand has: stored rows plus sessions on disk (line 1 always). */
  private async lineNumbers(workspaceSlug: string): Promise<number[]> {
    const found = new Set<number>([1]);
    for (const key of this.store.listSessions()) {
      const p = parseTgLineKey(key);
      if (p.workspaceSlug === workspaceSlug) found.add(p.line);
    }
    if (this.prisma.enabled) {
      const rows = await this.prisma.telegramSession.findMany({ where: { workspaceSlug }, select: { line: true } });
      for (const r of rows) found.add(r.line);
    }
    return [...found].sort((a, b) => a - b);
  }

  private lineConnected(workspaceSlug: string, line: number): boolean {
    return this.live.get(tgLineKey(workspaceSlug, line))?.isConnected ?? false;
  }

  /**
   * The account a message goes out from: the one in the group (groups and
   * channels), the one the contact wrote to (chats), otherwise the main one.
   */
  private async lineFor(workspaceSlug: string, to: string): Promise<number> {
    if (!this.prisma.enabled) return 1;
    const g = await this.prisma.group.findFirst({
      where: { workspaceSlug, channel: "tg", remoteJid: to },
      select: { tgLine: true },
    });
    if (g) return g.tgLine;
    const c = await this.prisma.conversation.findFirst({
      where: { workspaceSlug, channel: "tg", contactHandle: to },
      select: { tgLine: true },
    });
    return c?.tgLine ?? 1;
  }

  // ── TelegramSessionEvents (called by each session with its key) ──────────
  onQr(key: string, dataUrl: string): void {
    this.qrs.set(key, dataUrl);
    const { workspaceSlug, line } = parseTgLineKey(key);
    if (line === 1) this.gateway.emitQr(workspaceSlug, dataUrl);
  }

  onStatus(key: string, status: TelegramStatusValue): void {
    if (status !== "qr") this.qrs.delete(key);
    void this.persist(key, { status }).then(() => this.emit(key));
  }

  onMeta(
    key: string,
    meta: {
      username?: string | null;
      phone?: string | null;
      groupsCount?: number;
      connectedAt?: Date;
    },
  ): void {
    void this.persist(key, {
      username: meta.username ?? undefined,
      phone: meta.phone ?? undefined,
      groupsCount: meta.groupsCount,
      lastConnectionAt: meta.connectedAt,
    }).then(() => this.emit(key));
  }

  onDialogs(key: string, dialogs: TelegramDialog[]): void {
    void this.persistDialogs(key, dialogs);
  }

  /** A direct inbound message → publish for the Inbox to persist (decoupled). */
  onInbound(key: string, msg: { contactHandle: string; contactName: string; text: string }): void {
    const { workspaceSlug, line } = parseTgLineKey(key);
    this.events.emit("session.inbound", { workspaceSlug, channel: "tg", ...msg, tgLine: line });
  }

  /** A connection problem → persist a notification and push the live status. */
  onAlert(key: string, alert: { level: "warning" | "error"; reason: string }): void {
    const { workspaceSlug, line } = parseTgLineKey(key);
    void this.notifications.create(workspaceSlug, {
      type: alert.level === "error" ? "error" : "warning",
      title: `Telegram${line > 1 ? ` (cuenta ${line})` : ""}: ${alert.reason}`,
      meta: "telegram",
    });
    void this.emit(key);
  }

  private async persistDialogs(key: string, dialogs: TelegramDialog[]): Promise<void> {
    if (!this.prisma.enabled || !dialogs.length) return;
    const { workspaceSlug, line } = parseTgLineKey(key);
    // A group several accounts are in keeps the account it had while that one
    // is connected; otherwise it moves to this account.
    const known = await this.prisma.group.findMany({
      where: { workspaceSlug, channel: "tg", remoteJid: { in: dialogs.map((d) => d.remoteJid) } },
      select: { remoteJid: true, tgLine: true },
    });
    const owner = new Map(known.map((g) => [g.remoteJid, g.tgLine]));
    for (const d of dialogs) {
      const current = owner.get(d.remoteJid);
      const tgLine = current && current !== line && this.lineConnected(workspaceSlug, current) ? current : line;
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
          tgLine,
        },
        update: { name: d.title, members: d.members, kind: d.kind, synced: true, tgLine },
      });
    }
  }

  private async persist(
    key: string,
    data: {
      status?: TelegramStatusValue;
      username?: string;
      phone?: string;
      groupsCount?: number;
      lastConnectionAt?: Date;
      label?: string | null;
    },
  ): Promise<void> {
    if (!this.prisma.enabled) return;
    const { workspaceSlug, line } = parseTgLineKey(key);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await this.prisma.telegramSession.upsert({
      where: { workspaceSlug_line: { workspaceSlug, line } },
      create: { workspaceSlug, line, ...clean },
      update: clean,
    });
  }

  private async emit(key: string): Promise<void> {
    // The live socket only carries the main account; the others are polled.
    const { workspaceSlug, line } = parseTgLineKey(key);
    if (line === 1) this.gateway.emitStatus(workspaceSlug, await this.status(workspaceSlug));
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async status(workspaceSlug: string, line = 1): Promise<TelegramStatus> {
    const key = tgLineKey(workspaceSlug, line);
    const row = this.prisma.enabled
      ? await this.prisma.telegramSession.findUnique({ where: { workspaceSlug_line: { workspaceSlug, line } } })
      : null;
    const session = this.live.get(key);
    const live = session?.currentStatus;
    // Never report a stale "connected" from the DB when no live session backs it
    // — sends only work through the live session, so the panel must reflect that
    // reality (prompting a reconnect) instead of showing a green "Conectado" that
    // silently fails every send.
    const persisted = row?.status as TelegramStatusValue | undefined;
    const status = live ?? (persisted && persisted !== "connected" ? persisted : "disconnected");
    return {
      status,
      provider: "mtproto",
      line,
      label: row?.label ?? null,
      qr: status === "qr" ? (this.qrs.get(key) ?? null) : null,
      username: row?.username ?? null,
      phone: row?.phone ?? null,
      lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
      groupsCount: row?.groupsCount ?? 0,
      error: session?.lastError ?? null,
    };
  }

  /** Every Telegram account of the brand (main first). */
  async lines(workspaceSlug: string): Promise<TelegramStatus[]> {
    const numbers = await this.lineNumbers(workspaceSlug);
    return Promise.all(numbers.map((n) => this.status(workspaceSlug, n)));
  }

  /** Link one more account: opens a new session that shows its own QR. */
  async addLine(workspaceSlug: string, label?: string | null): Promise<TelegramStatus> {
    const numbers = await this.lineNumbers(workspaceSlug);
    const planMax = (await this.access?.limits(workspaceSlug))?.telegramAccounts;
    if (planMax !== undefined && numbers.length >= planMax) {
      throw new HttpException(
        `Tu plan incluye ${planMax} ${planMax === 1 ? "cuenta" : "cuentas"} de Telegram. Mejora a Pro para conectar más.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    if (numbers.length >= MAX_TG_LINES) {
      throw new BadRequestException(`Puedes conectar hasta ${MAX_TG_LINES} cuentas de Telegram por marca.`);
    }
    const line = Math.max(...numbers) + 1;
    await this.persist(tgLineKey(workspaceSlug, line), { status: "disconnected", label: label?.trim() || null });
    return this.connect(workspaceSlug, line);
  }

  async renameLine(workspaceSlug: string, line: number, label: string | null): Promise<TelegramStatus> {
    await this.persist(tgLineKey(workspaceSlug, line), { label: label?.trim() || null });
    return this.status(workspaceSlug, line);
  }

  /**
   * Unlink an extra account: closes it, forgets its sign-in and its groups.
   * Its chats stay in the Inbox and are answered from the main account.
   */
  async removeLine(workspaceSlug: string, line: number): Promise<void> {
    if (line <= 1) throw new BadRequestException("La cuenta principal se desconecta, no se elimina.");
    const key = tgLineKey(workspaceSlug, line);
    await this.live.get(key)?.logout();
    this.live.delete(key);
    this.store.delete(key);
    this.qrs.delete(key);
    if (!this.prisma.enabled) return;
    await this.prisma.group.deleteMany({ where: { workspaceSlug, channel: "tg", synced: true, tgLine: line } });
    await this.prisma.conversation.updateMany({ where: { workspaceSlug, tgLine: line }, data: { tgLine: null } });
    await this.prisma.telegramSession.deleteMany({ where: { workspaceSlug, line } });
  }

  async connect(workspaceSlug: string, line = 1): Promise<TelegramStatus> {
    const creds = await this.resolveCreds(workspaceSlug);
    // 422 (not 500): es un fallo de configuración, no un crash del servidor.
    // El front muestra este mensaje tal cual para guiar al usuario.
    if (!creds) throw new UnprocessableEntityException(NOT_CONFIGURED);
    try {
      await this.getOrCreate(tgLineKey(workspaceSlug, line), creds).start();
    } catch (err) {
      // Cualquier fallo al iniciar la sesión (red, credenciales, timeout) se
      // reporta como 503 con el motivo, nunca como un 500 sin explicación.
      const reason = err instanceof Error ? err.message : "error desconocido";
      throw new ServiceUnavailableException(`No se pudo iniciar Telegram: ${reason}`);
    }
    return this.status(workspaceSlug, line);
  }

  reconnect(workspaceSlug: string, line = 1): Promise<TelegramStatus> {
    return this.connect(workspaceSlug, line);
  }

  async disconnect(workspaceSlug: string, line = 1): Promise<TelegramStatus> {
    const key = tgLineKey(workspaceSlug, line);
    await this.live.get(key)?.logout();
    this.live.delete(key);
    this.qrs.delete(key);
    await this.persist(key, {
      status: "disconnected",
      username: undefined,
      phone: undefined,
      groupsCount: 0,
    });
    return this.status(workspaceSlug, line);
  }

  async sync(workspaceSlug: string, line = 1): Promise<TelegramStatus> {
    await this.live.get(tgLineKey(workspaceSlug, line))?.sync();
    return this.status(workspaceSlug, line);
  }

  /** Provide the 2FA password when a QR sign-in is waiting for it. */
  async submitPassword(workspaceSlug: string, password: string, line = 1): Promise<TelegramStatus> {
    const session = this.live.get(tgLineKey(workspaceSlug, line));
    if (!session)
      throw new UnprocessableEntityException(
        "No hay una conexión de Telegram en curso. Pulsa Conectar y escanea el QR primero.",
      );
    session.submitPassword(password);
    return this.status(workspaceSlug, line);
  }

  /** Whether the account (or, without `line`, any account of the brand) is connected. */
  isConnected(workspaceSlug: string, line?: number): boolean {
    if (line !== undefined) return this.lineConnected(workspaceSlug, line);
    for (const [key, s] of this.live) {
      if (parseTgLineKey(key).workspaceSlug === workspaceSlug && s.isConnected) return true;
    }
    return false;
  }

  /** Whether any account of the brand is still signing in («connecting»). */
  isConnecting(workspaceSlug: string): boolean {
    for (const [key, s] of this.live) {
      if (parseTgLineKey(key).workspaceSlug === workspaceSlug && s.currentStatus === "connecting") return true;
    }
    return false;
  }

  /**
   * Guarantee a live, connected session for that account before a send.
   * Self-heals the common case where the account is still authorized but the
   * live session dropped (e.g. after an API restart): it resumes silently from
   * the stored StringSession — no QR needed. Only throws an actionable error
   * when there is genuinely no way to reconnect without re-linking.
   */
  private async ensureConnected(workspaceSlug: string, line: number): Promise<TelegramUserSession> {
    const key = tgLineKey(workspaceSlug, line);
    if (!this.lineConnected(workspaceSlug, line)) {
      const creds = await this.resolveCreds(workspaceSlug);
      if (!creds) {
        throw new Error(
          "Telegram (cuenta) no configurado. Añade tu API ID y API Hash en Integraciones → Telegram (my.telegram.org).",
        );
      }
      if (this.store.load(key)) {
        await this.getOrCreate(key, creds)
          .start()
          .catch(() => undefined);
      }
    }
    if (this.lineConnected(workspaceSlug, line)) return this.live.get(key)!;
    const name = line > 1 ? `La cuenta ${line} de Telegram` : "Telegram (cuenta)";
    throw new Error(
      `${name} no está conectada. Abre Conexiones → Telegram y pulsa Reconectar (o escanea el QR).`,
    );
  }

  async sendText(workspaceSlug: string, to: string, text: string): Promise<{ id: string }> {
    const session = await this.ensureConnected(workspaceSlug, await this.lineFor(workspaceSlug, to));
    return session.sendText(to, text);
  }

  async sendMedia(
    workspaceSlug: string,
    to: string,
    text: string,
    attachment?: TelegramAttachment | null,
  ): Promise<{ id: string }> {
    const session = await this.ensureConnected(workspaceSlug, await this.lineFor(workspaceSlug, to));
    return session.sendMedia(to, text, attachment);
  }
}
