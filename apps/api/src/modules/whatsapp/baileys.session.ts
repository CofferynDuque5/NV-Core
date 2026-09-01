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
import { MAX_RECONNECT_ATTEMPTS, backoffDelay, classifyDisconnect } from "./reconnect-policy";

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
  /** Consecutive failed reconnects; reset to 0 on a successful open. */
  private reconnectAttempts = 0;
  /** Pending reconnect timer, so we never stack overlapping retries. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last failure reason, surfaced in the panel (null when healthy). */
  lastError: string | null = null;
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
    // A fresh start supersedes any pending backoff retry.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
      this.sock.ev.on("messaging-history.set", (h: any) => {
        this.trackContacts(h?.contacts ?? []);
        this.seedInboxFromHistory(h?.messages ?? []);
      });
      this.sock.ev.on("messages.upsert", (u: any) => this.onIncomingMessages(u));
      this.sock.ev.on("connection.update", (u: any) => this.onConnectionUpdate(u));
    } catch (err) {
      this.logger.error(`No se pudo iniciar Baileys: ${(err as Error).message}`);
      this.setStatus("disconnected");
    } finally {
      this.starting = false;
    }
  }

  private async onConnectionUpdate(u: any): Promise<void> {
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
      // Healthy again: clear the backoff counter and any surfaced error.
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.setStatus("connected");
      this.events.onMeta(this.workspaceSlug, { number, connectedAt: new Date() });
      this.logger.log(`Conectado${number ? ` (${number})` : ""}.`);
      void this.sync();
    } else if (connection === "close") {
      this.handleClose(lastDisconnect?.error?.output?.statusCode);
    }
  }

  /** Decide what to do when the socket closes: clear, stop, or retry w/ backoff. */
  private handleClose(statusCode: number | undefined): void {
    this.sock = null;

    // A user-initiated stop is never an error and never auto-reconnects.
    if (this.manualStop) {
      this.setStatus("disconnected");
      return;
    }

    const decision = classifyDisconnect(statusCode);

    if (decision.action === "clear") {
      // Credentials are dead — drop them so the next connect shows a fresh QR.
      this.sessions.deleteSession(this.workspaceSlug);
      this.reconnectAttempts = 0;
      this.lastError = decision.reason;
      this.setStatus("disconnected");
      this.logger.warn(`Sesión cerrada: ${decision.reason}`);
      this.events.onAlert(this.workspaceSlug, { level: "warning", reason: decision.reason });
      return;
    }

    if (decision.action === "stop") {
      // Retrying would be harmful (another session active / blocked). Wait for a
      // manual reconnect and tell the user why.
      this.reconnectAttempts = 0;
      this.lastError = decision.reason;
      this.setStatus("disconnected");
      this.logger.error(`Reconexión detenida: ${decision.reason}`);
      this.events.onAlert(this.workspaceSlug, { level: "error", reason: decision.reason });
      return;
    }

    // action === "retry": back off, and give up (with an alert) after too many.
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      const reason = `No se pudo reconectar tras ${MAX_RECONNECT_ATTEMPTS} intentos. Reconecta manualmente.`;
      this.reconnectAttempts = 0;
      this.lastError = reason;
      this.setStatus("disconnected");
      this.logger.error(reason);
      this.events.onAlert(this.workspaceSlug, { level: "error", reason });
      return;
    }

    const delay = backoffDelay(this.reconnectAttempts);
    this.lastError = decision.expected ? null : decision.reason;
    this.setStatus("connecting");
    this.logger.warn(
      `${decision.reason} Reintento ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} en ${Math.round(delay / 1000)}s.`,
    );
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, delay);
  }

  /**
   * Forward incoming DIRECT (1:1) text messages to the Inbox via onInbound.
   * Groups (`@g.us`) and status broadcasts are skipped so the inbox isn't
   * flooded with broadcast traffic; only real conversations land there.
   */
  private onIncomingMessages(u: any): void {
    if (u?.type !== "notify" || !Array.isArray(u.messages)) return;
    for (const m of u.messages) {
      try {
        if (m?.key?.fromMe) continue;
        const jid: string = m?.key?.remoteJid ?? "";
        if (!jid.endsWith("@s.whatsapp.net")) continue; // 1:1 chats only
        const text = BaileysSession.textOf(m);
        if (!text.trim()) continue;
        const handle = numberFromJid(jid) ?? jid.split("@")[0];
        const name = String(m?.pushName || handle);
        this.events.onInbound(this.workspaceSlug, { contactHandle: handle, contactName: name, text });
      } catch (err) {
        this.logger.warn(`Mensaje entrante ignorado: ${(err as Error).message}`);
      }
    }
  }

  /** Extract the readable text/caption from a Baileys message (empty if none). */
  private static textOf(m: any): string {
    return (
      m?.message?.conversation ??
      m?.message?.extendedTextMessage?.text ??
      m?.message?.imageMessage?.caption ??
      m?.message?.videoMessage?.caption ??
      ""
    );
  }

  /**
   * Seed the Inbox with recent 1:1 conversations from the history Baileys sends
   * right after linking. WhatsApp Web doesn't replay full history, but this gives
   * the operator their recent chats immediately instead of an empty inbox until
   * someone writes. One entry per contact (their most recent inbound text).
   */
  private seedInboxFromHistory(messages: any[]): void {
    if (!Array.isArray(messages) || !messages.length) return;
    const latest = new Map<string, { handle: string; name: string; text: string; ts: number }>();
    for (const m of messages) {
      try {
        if (m?.key?.fromMe) continue;
        const jid: string = m?.key?.remoteJid ?? "";
        if (!jid.endsWith("@s.whatsapp.net")) continue; // 1:1 chats only
        const text = BaileysSession.textOf(m);
        if (!text.trim()) continue;
        const ts = Number(m?.messageTimestamp ?? 0);
        const prev = latest.get(jid);
        if (prev && prev.ts >= ts) continue;
        const handle = numberFromJid(jid) ?? jid.split("@")[0];
        latest.set(jid, { handle, name: String(m?.pushName || handle), text, ts });
      } catch {
        /* ignore malformed history rows */
      }
    }
    for (const c of latest.values()) {
      this.events.onInbound(this.workspaceSlug, {
        contactHandle: c.handle,
        contactName: c.name,
        text: c.text,
      });
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

  /** Contact JIDs (`…@s.whatsapp.net`) tracked for this session. */
  contactJids(): string[] {
    return [...this.contacts].filter((jid) => jid.endsWith("@s.whatsapp.net"));
  }

  /**
   * Publish to the account's WhatsApp Status (Estados). Sends to the special
   * `status@broadcast` JID with the tracked contacts as the audience — WhatsApp
   * only delivers a status to the JIDs passed in `statusJidList`. Text-only
   * statuses render on a colored card; an image/video status uses the text as
   * its caption.
   */
  async postStatus(text: string, attachment?: WhatsappAttachment | null): Promise<{ id: string }> {
    if (!this.isConnected || !this.sock) {
      throw new Error("WhatsApp no está conectado en este workspace.");
    }
    // WhatsApp only delivers a status to the JIDs in `statusJidList` (your
    // contacts). If none synced yet, the status would post to nobody and look
    // like it "didn't publish" — fail loudly with an actionable message instead.
    // We intentionally do NOT fall back to group members (broadcasting a status
    // to strangers is spammy and a ban risk).
    const statusJidList = this.contactJids();
    if (statusJidList.length === 0) {
      throw new Error(
        "Sin destinatarios para el Estado: tus contactos aún no se sincronizaron. " +
          "Abre WhatsApp en el teléfono, recibe/envía algún mensaje para que se sincronicen " +
          "los contactos, pulsa «Sincronizar» en Conexiones y reintenta.",
      );
    }
    let content: any;
    if (attachment?.url) {
      const caption = text || undefined;
      if (attachment.kind === "video") content = { video: { url: attachment.url }, caption };
      else content = { image: { url: attachment.url }, caption };
    } else {
      // Colored text status card (font 3 = a neutral, readable default).
      content = { text, backgroundColor: "#0B3D2E", font: 3 };
    }
    const result = await this.sock.sendMessage("status@broadcast", content, {
      statusJidList,
      broadcast: true,
    });
    return { id: result?.key?.id ?? "" };
  }

  /** Log out: closes the socket and clears stored credentials. */
  async logout(): Promise<void> {
    this.manualStop = true;
    // Cancel any pending backoff retry so we don't reconnect after logout.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.lastError = null;
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
