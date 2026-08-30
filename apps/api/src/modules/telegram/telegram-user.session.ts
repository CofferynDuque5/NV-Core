import { Logger } from "@nestjs/common";

import type { TelegramSessionStore } from "./telegram-session.store";
import {
  loadGram,
  type TelegramAttachment,
  type TelegramDialog,
  type TelegramSessionEvents,
  type TelegramStatusValue,
} from "./telegram.types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el adjunto (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * One GramJS (MTProto) Telegram user connection for a single workspace.
 *
 * Owns the client lifecycle: QR login (emits the tg://login QR as a data URL to
 * the panel), persists the StringSession, imports the account's groups/channels,
 * and sends messages/media as the user. The QR sign-in runs in the background so
 * the HTTP "connect" call returns immediately (the panel gets the QR over WS).
 */
export class TelegramUserSession {
  private readonly logger: Logger;
  private client: any = null;
  private status: TelegramStatusValue = "disconnected";
  private starting = false;
  /** Last failure reason (surfaced in the panel so problems aren't silent). */
  lastError: string | null = null;
  /** Health-check timer: catches silent drops after GramJS gives up retrying. */
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnecting = false;
  /** Resolver for the 2FA password prompt (set while status === "password"). */
  private passwordResolver: ((password: string) => void) | null = null;

  /** How often to verify the MTProto connection is still alive. */
  private static readonly HEARTBEAT_MS = 30_000;

  constructor(
    private readonly workspaceSlug: string,
    private readonly apiId: number,
    private readonly apiHash: string,
    private readonly store: TelegramSessionStore,
    private readonly events: TelegramSessionEvents,
  ) {
    this.logger = new Logger(`TG:${workspaceSlug}`);
  }

  get currentStatus(): TelegramStatusValue {
    return this.status;
  }
  get isConnected(): boolean {
    return this.status === "connected";
  }

  private setStatus(status: TelegramStatusValue): void {
    this.status = status;
    this.events.onStatus(this.workspaceSlug, status);
  }

  /** Connect (resume if authorized), else begin QR login in the background. */
  async start(): Promise<void> {
    if (this.starting || this.isConnected) return;
    this.starting = true;
    this.lastError = null;
    try {
      const { TelegramClient, StringSession, NewMessage } = loadGram();
      const session = new StringSession(this.store.load(this.workspaceSlug) || "");
      this.client = new TelegramClient(session, this.apiId, this.apiHash, {
        connectionRetries: 5,
      });
      // Capture incoming private (1:1) messages for the Inbox.
      this.client.addEventHandler(
        (event: any) => this.onNewMessage(event),
        new NewMessage({ incoming: true }),
      );
      if (this.status === "disconnected") this.setStatus("connecting");
      await this.client.connect();

      if (await this.client.isUserAuthorized()) {
        await this.onAuthorized();
      } else {
        this.setStatus("qr");
        void this.runQrLogin(); // background — resolves when the user scans
      }
    } catch (err) {
      const msg = (err as Error).message;
      this.lastError = msg;
      this.logger.error(`No se pudo iniciar Telegram: ${msg}`);
      this.setStatus("disconnected");
      throw err; // surface to the HTTP "connect" call → panel shows the reason
    } finally {
      this.starting = false;
    }
  }

  private async runQrLogin(): Promise<void> {
    try {
      await this.client.signInUserWithQrCode(
        { apiId: this.apiId, apiHash: this.apiHash },
        {
          qrCode: async (code: any) => {
            const token = Buffer.from(code.token).toString("base64url");
            const url = `tg://login?token=${token}`;
            try {
              const { toDataURL } = await import("qrcode");
              this.events.onQr(this.workspaceSlug, await toDataURL(url));
            } catch (err) {
              this.logger.warn(`No se pudo generar el QR: ${(err as Error).message}`);
            }
          },
          onError: (err: any) => {
            this.logger.warn(`QR login: ${err?.message ?? err}`);
            return false; // keep polling until scanned or the promise settles
          },
          // The account has 2-Step Verification: instead of failing, ask the
          // user for their password via the panel and wait for it here. GramJS
          // calls this again on a wrong password, so each call arms a new prompt.
          password: async () => {
            this.lastError = "La cuenta tiene verificación en dos pasos (2FA). Ingresa tu contraseña.";
            this.setStatus("password");
            return new Promise<string>((resolve) => {
              this.passwordResolver = resolve;
            });
          },
        },
      );
      await this.onAuthorized();
    } catch (err) {
      const msg = (err as Error).message;
      this.lastError = msg;
      this.logger.error(`No se pudo completar el login por QR: ${msg}`);
      this.setStatus("disconnected");
    }
  }

  /** Provide the 2FA password the QR sign-in is waiting for. */
  submitPassword(password: string): void {
    if (!this.passwordResolver) {
      throw new Error("Telegram no está esperando una contraseña ahora mismo.");
    }
    const resolve = this.passwordResolver;
    this.passwordResolver = null;
    this.setStatus("connecting");
    resolve(password);
  }

  private async onAuthorized(): Promise<void> {
    this.lastError = null;
    this.store.save(this.workspaceSlug, this.client.session.save());
    this.setStatus("connected");
    this.startHeartbeat();
    try {
      const me = await this.client.getMe();
      this.events.onMeta(this.workspaceSlug, {
        username: me?.username ?? null,
        phone: me?.phone ?? null,
        connectedAt: new Date(),
      });
      this.logger.log(`Conectado${me?.username ? ` (@${me.username})` : ""}.`);
    } catch {
      /* ignore meta errors */
    }
    void this.sync();
  }

  /** Periodically verify the connection; reconnect once if GramJS dropped it. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => void this.checkConnection(), TelegramUserSession.HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  /**
   * GramJS reconnects transient drops on its own (connectionRetries). This
   * catches the case where it exhausted them: the client is no longer connected
   * but we still think we are. Try one reconnect; alert the user if it fails.
   */
  private async checkConnection(): Promise<void> {
    if (this.status !== "connected" || this.reconnecting || !this.client) return;
    // GramJS exposes a `connected` flag; treat a missing flag as still-alive.
    const alive = this.client.connected !== false;
    if (alive) return;

    this.reconnecting = true;
    this.setStatus("connecting");
    this.logger.warn("Conexión de Telegram perdida; reintentando…");
    try {
      await this.client.connect();
      if (this.client.connected !== false && (await this.client.isUserAuthorized())) {
        this.lastError = null;
        this.setStatus("connected");
        this.logger.log("Telegram reconectado.");
      } else {
        const reason = "Telegram se desconectó y requiere volver a vincular (QR).";
        this.lastError = reason;
        this.setStatus("disconnected");
        this.stopHeartbeat();
        this.events.onAlert(this.workspaceSlug, { level: "error", reason });
      }
    } catch (err) {
      const reason = `No se pudo reconectar Telegram: ${(err as Error).message}`;
      this.lastError = reason;
      this.setStatus("disconnected");
      this.stopHeartbeat();
      this.events.onAlert(this.workspaceSlug, { level: "error", reason });
    } finally {
      this.reconnecting = false;
    }
  }

  /**
   * Forward incoming PRIVATE (1:1) text messages to the Inbox. Group and
   * channel messages are ignored so the inbox isn't flooded with broadcasts.
   */
  private async onNewMessage(event: any): Promise<void> {
    try {
      const msg = event?.message;
      if (!msg || msg.out) return;
      if (!event.isPrivate) return; // 1:1 only
      const text: string = msg.message ?? "";
      if (!text.trim()) return;
      const sender = await msg.getSender().catch(() => null);
      const id = String(msg.senderId ?? sender?.id ?? "");
      if (!id) return;
      const name =
        (sender && ([sender.firstName, sender.lastName].filter(Boolean).join(" ") || sender.username)) ||
        id;
      this.events.onInbound(this.workspaceSlug, { contactHandle: id, contactName: String(name), text });
    } catch (err) {
      this.logger.warn(`Mensaje entrante ignorado: ${(err as Error).message}`);
    }
  }

  /** Fetch the account's groups + channels, persist them, report the count. */
  async sync(): Promise<{ groupsCount: number }> {
    const dialogs = await this.fetchDialogs();
    this.events.onDialogs(this.workspaceSlug, dialogs);
    this.events.onMeta(this.workspaceSlug, { groupsCount: dialogs.length });
    return { groupsCount: dialogs.length };
  }

  async fetchDialogs(): Promise<TelegramDialog[]> {
    if (!this.client || !this.isConnected) return [];
    try {
      const dialogs = await this.client.getDialogs({ limit: 500 });
      const out: TelegramDialog[] = [];
      for (const d of dialogs) {
        if (!d?.isGroup && !d?.isChannel) continue; // skip 1:1 chats
        const entity = d.entity ?? {};
        const isBroadcast = Boolean(d.isChannel) && !entity.megagroup;
        out.push({
          remoteJid: String(d.id ?? entity.id ?? ""),
          title: String(d.title ?? entity.title ?? "Telegram"),
          members: Number(entity.participantsCount ?? 0),
          kind: isBroadcast ? "channel" : "group",
        });
      }
      return out.filter((d) => d.remoteJid);
    } catch (err) {
      this.logger.warn(`No se pudieron sincronizar diálogos: ${(err as Error).message}`);
      return [];
    }
  }

  /** Resolve a stored peer id to an input entity (refreshing dialogs if needed). */
  private async resolve(to: string): Promise<any> {
    let id: any = to;
    try {
      id = BigInt(to);
    } catch {
      id = to;
    }
    try {
      return await this.client.getInputEntity(id);
    } catch {
      await this.client.getDialogs({ limit: 500 }); // repopulate entity cache
      return this.client.getInputEntity(id);
    }
  }

  async sendText(to: string, text: string): Promise<{ id: string }> {
    if (!this.client || !this.isConnected) throw new Error("Telegram no está conectado.");
    const entity = await this.resolve(to);
    const res = await this.client.sendMessage(entity, { message: text });
    return { id: String(res?.id ?? "") };
  }

  async sendMedia(to: string, text: string, attachment?: TelegramAttachment | null): Promise<{ id: string }> {
    if (!this.client || !this.isConnected) throw new Error("Telegram no está conectado.");
    if (!attachment?.url) return this.sendText(to, text);
    const entity = await this.resolve(to);
    const { CustomFile } = loadGram();
    const buffer = await fetchToBuffer(attachment.url);
    const name = attachment.filename ?? "archivo";
    const file = new CustomFile(name, buffer.length, "", buffer);
    const res = await this.client.sendFile(entity, {
      file,
      caption: text || undefined,
      forceDocument: attachment.kind === "document",
    });
    return { id: String(res?.id ?? "") };
  }

  async logout(): Promise<void> {
    this.stopHeartbeat();
    this.passwordResolver = null;
    this.lastError = null;
    try {
      await this.client?.disconnect?.();
    } catch {
      /* ignore */
    }
    this.store.delete(this.workspaceSlug);
    this.client = null;
    this.setStatus("disconnected");
  }
}
