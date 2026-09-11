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
  /** Terminal close (another session took over / blocked): don't auto-resume. */
  private giveUp = false;
  /** Consecutive failed reconnects; reset to 0 on a successful open. */
  private reconnectAttempts = 0;
  /** Pending reconnect timer, so we never stack overlapping retries. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last failure reason, surfaced in the panel (null when healthy). */
  lastError: string | null = null;
  private readonly contacts = new Set<string>();
  /** The user pressed "Conectar": if the stored creds turn out dead, go straight to a fresh QR. */
  private userInitiated = false;
  /** Keeps the cross-process owner lock fresh while this process runs the socket. */
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** This start() is resuming STORED credentials (vs. a fresh QR pairing). */
  private resumingStored = false;
  /** Fires if stored credentials neither open nor get rejected in time → fresh QR. */
  private resumeWatchdog: ReturnType<typeof setTimeout> | null = null;

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

  /** Log + persist to the shared event log (visible in the panel's diagnostics). */
  private note(message: string, level: "log" | "warn" | "error" = "log"): void {
    this.logger[level](message);
    this.sessions.appendEvent(this.workspaceSlug, message);
  }

  get isConnected(): boolean {
    return this.status === "connected";
  }

  /** This process is (or is becoming) the one running the socket. */
  get active(): boolean {
    return this.starting || this.sock !== null || this.reconnectTimer !== null;
  }

  /**
   * Watchdog hook: relaunch a session that dropped and is safe to resume. Only
   * acts on a fully "disconnected" session with stored credentials (never while
   * showing a QR, connecting, backing off, manually stopped, or after a terminal
   * close). This is what keeps WhatsApp alive on a host that restarts the process
   * or after transient retries were exhausted.
   */
  ensureAlive(): void {
    if (this.status !== "disconnected") return;
    if (this.starting || this.reconnectTimer || this.manualStop || this.giveUp) return;
    void this.start();
  }

  private setStatus(status: WhatsappStatusValue): void {
    this.status = status;
    this.events.onStatus(this.workspaceSlug, status);
  }

  /**
   * Open the socket. Safe to call repeatedly (no-ops while already starting/connected).
   * `userInitiated` = the operator pressed "Conectar": dead stored credentials
   * then fall through to a fresh QR instead of stopping at "desconectado".
   */
  async start(opts: { userInitiated?: boolean } = {}): Promise<void> {
    if (this.starting || this.isConnected) return;
    // Only one process may run a workspace's socket (hostings like Passenger
    // spawn several copies of the app). If another live process owns it, let it.
    if (!this.sessions.acquireLock(this.workspaceSlug)) {
      this.note("Otro proceso ya gestiona esta sesión de WhatsApp; no se duplica.");
      return;
    }
    // A fresh start supersedes any pending backoff retry.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Never run two sockets for one account: a socket still trying to resume
    // (e.g. the automatic boot-time resume) is torn down first, otherwise
    // WhatsApp closes BOTH with "connection replaced" and the QR never shows.
    if (this.sock) {
      this.note("Cierro el intento anterior antes de abrir uno nuevo.");
      try {
        this.sock.ev?.removeAllListeners?.("connection.update");
        this.sock.end?.(undefined);
      } catch {
        /* ignore */
      }
      this.sock = null;
    }
    this.starting = true;
    this.manualStop = false;
    this.giveUp = false;
    if (opts.userInitiated) this.userInitiated = true;
    this.resumingStored = this.sessions.hasSession(this.workspaceSlug);
    this.startHeartbeat();
    this.armResumeWatchdog();
    // Show "connecting" right away — before any network lookup — so the panel
    // never sits on "desconectado" while we wait for a slow/blocked host.
    if (this.status === "disconnected") this.setStatus("connecting");
    this.note(
      `Iniciando (${opts.userInitiated ? "pulsó Conectar" : "automático"}; credenciales guardadas: ${this.sessions.hasSession(this.workspaceSlug) ? "sí" : "no"}; node ${process.version}).`,
    );
    try {
      const baileys = await loadBaileys();
      this.note("Baileys cargado.");
      const makeWASocket = (baileys.default ?? (baileys as any).makeWASocket) as any;
      const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileys as any;

      const dir = this.sessions.dirFor(this.workspaceSlug);
      const { state, saveCreds } = await useMultiFileAuthState(dir);

      // Fetch the current WhatsApp Web protocol version before opening the
      // socket. Without this Baileys uses the version bundled at build time,
      // which WhatsApp rejects once it drifts — the connection closes instantly
      // in a reconnect loop and the QR is never emitted. Falls back to the
      // bundled version if the lookup fails or hangs (offline / blocked host):
      // the fetch has no timeout of its own, so we cap it here.
      let version: number[] | undefined;
      try {
        const res = (await withTimeout(fetchLatestBaileysVersion?.(), VERSION_LOOKUP_TIMEOUT_MS)) as
          | { version?: number[] }
          | undefined;
        version = res?.version;
        if (version) this.note(`WhatsApp Web v${version.join(".")}`);
      } catch (err) {
        this.note(
          `No se pudo obtener la versión de WhatsApp Web; uso la incluida: ${(err as Error).message}`,
          "warn",
        );
      }

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
      this.note("Socket abierto; esperando QR o sesión…");
    } catch (err) {
      this.note(`No se pudo iniciar Baileys: ${(err as Error).message}`, "error");
      this.starting = false;
      if (this.resumingStored && this.userInitiated) {
        // Corrupt/incompatible stored session: don't strand the operator — pair fresh.
        this.dropCredsForFreshQr("Las credenciales guardadas están dañadas");
        return;
      }
      this.lastError = `No se pudo iniciar WhatsApp: ${(err as Error).message}`;
      this.stopHeartbeat();
      this.setStatus("disconnected");
    } finally {
      this.starting = false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.sessions.touchLock(this.workspaceSlug), HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  /** Stop owning the session in this process (terminal states only). */
  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.clearResumeWatchdog();
    this.sessions.releaseLock(this.workspaceSlug);
  }

  /**
   * Resuming stored credentials must either open or be rejected quickly. If the
   * socket just hangs (host blips, stale session) and the operator is waiting
   * for a QR, drop the creds and pair fresh instead of sitting on "conectando".
   */
  private armResumeWatchdog(): void {
    this.clearResumeWatchdog();
    if (!this.resumingStored || !this.userInitiated) return;
    this.resumeWatchdog = setTimeout(() => {
      this.resumeWatchdog = null;
      if (this.isConnected || this.status === "qr" || !this.resumingStored) return;
      this.dropCredsForFreshQr(`Sin respuesta en ${RESUME_TIMEOUT_MS / 1000}s con las credenciales guardadas`);
    }, RESUME_TIMEOUT_MS);
    this.resumeWatchdog.unref?.();
  }

  private clearResumeWatchdog(): void {
    if (this.resumeWatchdog) clearTimeout(this.resumeWatchdog);
    this.resumeWatchdog = null;
  }

  /** Discard stored credentials and restart to pair with a fresh QR. */
  private dropCredsForFreshQr(reason: string): void {
    this.note(`${reason}; se descartan y se genera un QR nuevo.`, "warn");
    try {
      this.sock?.ev?.removeAllListeners?.("connection.update");
      this.sock?.end?.(undefined);
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.sessions.deleteSession(this.workspaceSlug);
    this.resumingStored = false;
    this.reconnectAttempts = 0;
    this.lastError = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.setStatus("connecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start({ userInitiated: true });
    }, 500);
  }

  private async onConnectionUpdate(u: any): Promise<void> {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      try {
        const { toDataURL } = await import("qrcode");
        const dataUrl = await toDataURL(qr);
        this.resumingStored = false;
        this.clearResumeWatchdog();
        this.setStatus("qr");
        this.events.onQr(this.workspaceSlug, dataUrl);
        this.note("QR generado (escanéalo desde WhatsApp → Dispositivos vinculados).");
      } catch (err) {
        this.note(`No se pudo generar el QR: ${(err as Error).message}`, "warn");
      }
    }

    if (connection === "open") {
      const number = numberFromJid(this.sock?.user?.id);
      // Healthy again: clear the backoff counter and any surfaced error.
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.userInitiated = false;
      this.resumingStored = false;
      this.clearResumeWatchdog();
      this.setStatus("connected");
      this.events.onMeta(this.workspaceSlug, { number, connectedAt: new Date() });
      this.note(`Conectado${number ? ` (${number})` : ""}.`);
      void this.sync();
    } else if (connection === "close") {
      this.handleClose(lastDisconnect?.error?.output?.statusCode);
    }
  }

  /** Decide what to do when the socket closes: clear, stop, or retry w/ backoff. */
  private handleClose(statusCode: number | undefined): void {
    this.sock = null;
    this.note(`Conexión cerrada (código ${statusCode ?? "desconocido"}).`, "warn");

    // A user-initiated stop is never an error and never auto-reconnects.
    if (this.manualStop) {
      this.stopHeartbeat();
      this.setStatus("disconnected");
      return;
    }

    const decision = classifyDisconnect(statusCode);

    if (decision.action === "clear") {
      // Credentials are dead — drop them so the next connect shows a fresh QR.
      this.sessions.deleteSession(this.workspaceSlug);
      this.reconnectAttempts = 0;
      this.note(`Sesión cerrada: ${decision.reason}`, "warn");
      if (this.userInitiated) {
        // The operator is waiting in front of the panel: don't stop at
        // "desconectado" and make them click again — open a fresh QR now.
        this.userInitiated = false;
        this.lastError = null;
        this.setStatus("connecting");
        this.note("Credenciales descartadas; generando un QR nuevo.");
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.start();
        }, 500);
        return;
      }
      this.lastError = decision.reason;
      this.stopHeartbeat();
      this.setStatus("disconnected");
      this.events.onAlert(this.workspaceSlug, { level: "warning", reason: decision.reason });
      return;
    }

    if (decision.action === "stop") {
      // Retrying would be harmful (another session active / blocked). Wait for a
      // manual reconnect and tell the user why. The watchdog must not resume it.
      this.giveUp = true;
      this.reconnectAttempts = 0;
      this.lastError = decision.reason;
      this.stopHeartbeat();
      this.setStatus("disconnected");
      this.note(`Reconexión detenida: ${decision.reason}`, "error");
      this.events.onAlert(this.workspaceSlug, { level: "error", reason: decision.reason });
      return;
    }

    // The operator pressed "Conectar" and the STORED credentials keep failing
    // without WhatsApp rejecting them outright (timeouts, restart loops…):
    // don't make them wait through ten retries — drop the creds and show a QR.
    if (this.userInitiated && this.resumingStored && this.reconnectAttempts >= 1) {
      this.dropCredsForFreshQr("Las credenciales guardadas no responden");
      return;
    }

    // action === "retry": back off, and give up (with an alert) after too many.
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      const reason = `No se pudo reconectar tras ${MAX_RECONNECT_ATTEMPTS} intentos. Reconecta manualmente.`;
      this.reconnectAttempts = 0;
      this.lastError = reason;
      this.stopHeartbeat();
      this.setStatus("disconnected");
      this.note(reason, "error");
      this.events.onAlert(this.workspaceSlug, { level: "error", reason });
      return;
    }

    const delay = backoffDelay(this.reconnectAttempts);
    this.lastError = decision.expected ? null : decision.reason;
    this.setStatus("connecting");
    this.note(
      `${decision.reason} Reintento ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} en ${Math.round(delay / 1000)}s.`,
      "warn",
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
        this.events.onInbound(this.workspaceSlug, {
          contactHandle: handle,
          contactName: name,
          text,
        });
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
  async sendToGroup(
    remoteJid: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
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
  async sendMedia(
    to: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
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
    this.note("Desconectar pulsado: cerrando sesión y borrando credenciales.");
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
    this.stopHeartbeat();
    this.setStatus("disconnected");
  }
}

/** Lock heartbeat cadence (must stay well under the lock TTL). */
const HEARTBEAT_MS = 20_000;
/** Max wait for stored credentials to open before pairing fresh (user-initiated). */
const RESUME_TIMEOUT_MS = 40_000;
/** Cap on the WhatsApp Web version lookup (the fetch itself has no timeout). */
const VERSION_LOOKUP_TIMEOUT_MS = 6_000;

function withTimeout<T>(p: Promise<T> | undefined, ms: number): Promise<T | undefined> {
  if (!p) return Promise.resolve(undefined);
  return new Promise<T | undefined>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout tras ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
