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
    try {
      const { TelegramClient, StringSession } = loadGram();
      const session = new StringSession(this.store.load(this.workspaceSlug) || "");
      this.client = new TelegramClient(session, this.apiId, this.apiHash, {
        connectionRetries: 5,
      });
      if (this.status === "disconnected") this.setStatus("connecting");
      await this.client.connect();

      if (await this.client.isUserAuthorized()) {
        await this.onAuthorized();
      } else {
        this.setStatus("qr");
        void this.runQrLogin(); // background — resolves when the user scans
      }
    } catch (err) {
      this.logger.error(`No se pudo iniciar Telegram: ${(err as Error).message}`);
      this.setStatus("disconnected");
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
          password: async () => {
            throw new Error(
              "La cuenta tiene verificación en dos pasos (2FA). Desactívala temporalmente para vincular por QR.",
            );
          },
        },
      );
      await this.onAuthorized();
    } catch (err) {
      this.logger.error(`No se pudo completar el login por QR: ${(err as Error).message}`);
      this.setStatus("disconnected");
    }
  }

  private async onAuthorized(): Promise<void> {
    this.store.save(this.workspaceSlug, this.client.session.save());
    this.setStatus("connected");
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
