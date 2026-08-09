import { Logger } from "@nestjs/common";

import type { SessionManager } from "./session-manager";
import {
  loadBaileys,
  numberFromJid,
  silentLogger,
  toJid,
  type SessionEvents,
  type WhatsappAttachment,
  type WhatsappGroup,
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
      const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileys as any;

      const dir = this.sessions.dirFor(this.workspaceSlug);
      const { state, saveCreds } = await useMultiFileAuthState(dir);

      // Fetch the current WhatsApp Web protocol version before opening the
      // socket. Without this Baileys uses the version bundled at build time,
      // which WhatsApp rejects once it drifts — the connection closes instantly
      // in a reconnect loop and the QR is never emitted. Falls back to the
      // bundled version if the lookup fails (offline / blocked).
      let version: number[] | undefined;
      try {
        const res = await fetchLatestBaileysVersion?.();
        version = res?.version;
        if (version) this.logger.log(`WhatsApp Web v${version.join(".")}`);
      } catch (err) {
        this.logger.warn(
          `No se pudo obtener la versión de WhatsApp Web; uso la incluida: ${(err as Error).message}`,
        );
      }

      if (this.status === "disconnected") this.setStatus("connecting");

      this.sock = makeWASocket({
        auth: state,
        version,
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

  /** Fetch groups (and current contact count), persist the list, and report counts. */
  async sync(): Promise<{ groupsCount: number; contactsCount: number }> {
    const groups = await this.fetchGroups();
    this.events.onGroups(this.workspaceSlug, groups);
    const contactsCount = this.contacts.size;
    this.events.onMeta(this.workspaceSlug, { groupsCount: groups.length, contactsCount });
    return { groupsCount: groups.length, contactsCount };
  }

  /** Read the participating groups with their subject and member count. */
  async fetchGroups(): Promise<WhatsappGroup[]> {
    try {
      const groups = await this.sock?.groupFetchAllParticipating?.();
      if (!groups) return [];
      return Object.values(groups).map((g: any) => ({
        remoteJid: String(g.id),
        subject: String(g.subject ?? g.id),
        size: Number(g.size ?? g.participants?.length ?? 0),
      }));
    } catch (err) {
      this.logger.warn(`No se pudieron sincronizar grupos: ${(err as Error).message}`);
      return [];
    }
  }

  /** Send a text message. Throws if not connected. */
  async sendText(to: string, text: string): Promise<{ id: string }> {
    if (!this.isConnected || !this.sock) {
      throw new Error("WhatsApp no está conectado en este workspace.");
    }
    const result = await this.sock.sendMessage(toJid(to), { text });
    return { id: result?.key?.id ?? "" };
  }

  /**
   * Send to a group JID, optionally with media (delivered by public URL). Text
   * becomes the caption for image/video, or a separate message for documents.
   */
  async sendToGroup(remoteJid: string, text: string, attachment?: WhatsappAttachment | null): Promise<{ id: string }> {
    if (!this.isConnected || !this.sock) {
      throw new Error("WhatsApp no está conectado en este workspace.");
    }
    const jid = remoteJid.includes("@") ? remoteJid : `${remoteJid}@g.us`;
    let content: any;
    if (attachment?.url) {
      const caption = text || undefined;
      if (attachment.kind === "image") content = { image: { url: attachment.url }, caption };
      else if (attachment.kind === "video") content = { video: { url: attachment.url }, caption };
      else
        content = {
          document: { url: attachment.url },
          mimetype: attachment.mime ?? "application/octet-stream",
          fileName: attachment.filename ?? "archivo",
          caption,
        };
    } else {
      content = { text };
    }
    const result = await this.sock.sendMessage(jid, content);
    return { id: result?.key?.id ?? "" };
  }

  /**
   * Send media (or text) to any target — a group JID (`…@g.us`), a full JID, or
   * a bare phone number (routed to `…@s.whatsapp.net`).
   */
  async sendMedia(to: string, text: string, attachment?: WhatsappAttachment | null): Promise<{ id: string }> {
    // toJid keeps group/full JIDs as-is and maps a bare number to s.whatsapp.net.
    return this.sendToGroup(toJid(to), text, attachment);
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
