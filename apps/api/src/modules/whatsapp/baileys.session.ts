import { Logger } from "@nestjs/common";

import type { SessionManager } from "./session-manager";
import {
  loadBaileys,
  numberFromJid,
  silentLogger,
  toJid,
  type SessionEvents,
  type WhatsappStatusValue,
} from "./whatsapp.types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * One Baileys WhatsApp connection for a single workspace.
 *
 * Owns the socket lifecycle: emits the QR (as a data URL) to the panel, saves
 * credentials, auto-reconnects on transient drops, and clears the session on a
 * real logout. Group/contact counts are gathered after connecting.
 */
export class BaileysSession {
  private readonly logger: Logger;
  private sock: any = null;
  private status: WhatsappStatusValue = "disconnected";
  private starting = false;
  private manualStop = false;
  private readonly contacts = new Set<string>();

  constructor(
    private readonly workspaceSlug: string,
    private readonly sessions: SessionManager,
    private readonly events: SessionEvents,
  ) {
    this.logger = new Logger(`WA:${workspaceSlug}`);
  }

  get currentStatus(): WhatsappStatusValue {
    return this.status;
  }

  get isConnected(): boolean {
    return this.status === "connected";
  }

  private setStatus(status: WhatsappStatusValue): void {
    this.status = status;
    this.events.onStatus(this.workspaceSlug, status);
  }

  /** Open the socket. Safe to call repeatedly (no-ops while already starting/connected). */
  async start(): Promise<void> {
    if (this.starting || this.isConnected) return;
    this.starting = true;
    this.manualStop = false;
    try {
      const baileys = await loadBaileys();
      const makeWASocket = (baileys.default ?? (baileys as any).makeWASocket) as any;
      const { useMultiFileAuthState } = baileys as any;

      const dir = this.sessions.dirFor(this.workspaceSlug);
      const { state, saveCreds } = await useMultiFileAuthState(dir);

      if (this.status === "disconnected") this.setStatus("connecting");

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: silentLogger(),
        markOnlineOnConnect: false,
      });

      this.sock.ev.on("creds.update", saveCreds);
      this.sock.ev.on("contacts.upsert", (rows: any[]) => this.trackContacts(rows));
      this.sock.ev.on("contacts.update", (rows: any[]) => this.trackContacts(rows));
      this.sock.ev.on("messaging-history.set", (h: any) => this.trackContacts(h?.contacts ?? []));
      this.sock.ev.on("connection.update", (u: any) => this.onConnectionUpdate(baileys, u));
    } catch (err) {
      this.logger.error(`No se pudo iniciar Baileys: ${(err as Error).message}`);
      this.setStatus("disconnected");
    } finally {
      this.starting = false;
    }
  }

  private async onConnectionUpdate(baileys: any, u: any): Promise<void> {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      try {
        const { toDataURL } = await import("qrcode");
        const dataUrl = await toDataURL(qr);
        this.setStatus("qr");
        this.events.onQr(this.workspaceSlug, dataUrl);
      } catch (err) {
        this.logger.warn(`No se pudo generar el QR: ${(err as Error).message}`);
      }
    }

    if (connection === "open") {
      const number = numberFromJid(this.sock?.user?.id);
      this.setStatus("connected");
      this.events.onMeta(this.workspaceSlug, { number, connectedAt: new Date() });
      this.logger.log(`Conectado${number ? ` (${number})` : ""}.`);
      void this.sync();
    } else if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === baileys.DisconnectReason?.loggedOut;
      if (loggedOut || this.manualStop) {
        this.sessions.deleteSession(this.workspaceSlug);
        this.sock = null;
        this.setStatus("disconnected");
        this.logger.warn("Sesión cerrada (logout). Hará falta un QR nuevo.");
      } else {
        this.setStatus("connecting");
        this.logger.warn("Conexión caída; reconectando…");
        setTimeout(() => void this.start(), 2000);
      }
    }
  }

  private trackContacts(rows: any[]): void {
    if (!Array.isArray(rows)) return;
    for (const c of rows) if (c?.id) this.contacts.add(String(c.id));
    if (this.contacts.size > 0) {
      this.events.onMeta(this.workspaceSlug, { contactsCount: this.contacts.size });
    }
  }

  /** Fetch groups (and current contact count) and report them. */
  async sync(): Promise<{ groupsCount: number; contactsCount: number }> {
    let groupsCount = 0;
    try {
      const groups = await this.sock?.groupFetchAllParticipating?.();
      groupsCount = groups ? Object.keys(groups).length : 0;
    } catch (err) {
      this.logger.warn(`No se pudieron sincronizar grupos: ${(err as Error).message}`);
    }
    const contactsCount = this.contacts.size;
    this.events.onMeta(this.workspaceSlug, { groupsCount, contactsCount });
    return { groupsCount, contactsCount };
  }

  /** Send a text message. Throws if not connected. */
  async sendText(to: string, text: string): Promise<{ id: string }> {
    if (!this.isConnected || !this.sock) {
      throw new Error("WhatsApp no está conectado en este workspace.");
    }
    const result = await this.sock.sendMessage(toJid(to), { text });
    return { id: result?.key?.id ?? "" };
  }

  /** Log out: closes the socket and clears stored credentials. */
  async logout(): Promise<void> {
    this.manualStop = true;
    try {
      await this.sock?.logout?.();
    } catch {
      /* ignore */
    }
    this.sessions.deleteSession(this.workspaceSlug);
    this.sock = null;
    this.contacts.clear();
    this.setStatus("disconnected");
  }
}
