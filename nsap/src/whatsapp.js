import { rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";

import { store } from "./store.js";

const SESSION_DIR = resolve(process.env.NSAP_SESSION_DIR ?? "data/session");

/** Logger silencioso compatible con Baileys/pino. */
function silentLogger() {
  const noop = () => undefined;
  const l = { level: "silent", trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
  l.child = () => l;
  return l;
}

export function toGroupJid(id) {
  return id.includes("@") ? id : `${id}@g.us`;
}
function numberFromJid(jid) {
  if (!jid) return null;
  const d = String(jid).split("@")[0]?.split(":")[0]?.replace(/[^0-9]/g, "");
  return d ? `+${d}` : null;
}

/**
 * Conexión WhatsApp única (single-tenant) sobre Baileys.
 * Emite QR/estado/grupos por Socket.IO y persiste metadatos + snapshot de grupos.
 */
class WhatsAppManager {
  constructor() {
    this.io = null;
    this.sock = null;
    this.status = "disconnected"; // disconnected | connecting | qr | connected
    this.qr = null;
    this.contacts = new Set();
    this.starting = false;
    this.manualStop = false;
  }

  init(io) {
    this.io = io;
    // Reconexión automática si ya existe una sesión guardada.
    if (existsSync(resolve(SESSION_DIR, "creds.json"))) {
      this.connect().catch(() => undefined);
    }
  }

  getStatus() {
    const meta = store.getWhatsappMeta();
    return {
      status: this.status,
      provider: "baileys",
      number: meta.number ?? null,
      lastConnectionAt: meta.lastConnectionAt ?? null,
      groupsCount: store.getGroups().length,
      contactsCount: meta.contactsCount ?? this.contacts.size,
    };
  }

  isConnected() {
    return this.status === "connected";
  }

  #setStatus(status) {
    this.status = status;
    this.io?.emit("wa:status", this.getStatus());
  }

  async connect() {
    if (this.starting || this.isConnected()) return this.getStatus();
    this.starting = true;
    this.manualStop = false;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      if (this.status === "disconnected") this.#setStatus("connecting");

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: silentLogger(),
        markOnlineOnConnect: false,
      });

      this.sock.ev.on("creds.update", saveCreds);
      this.sock.ev.on("contacts.upsert", (rows) => this.#trackContacts(rows));
      this.sock.ev.on("messaging-history.set", (h) => this.#trackContacts(h?.contacts ?? []));
      this.sock.ev.on("connection.update", (u) => this.#onConnectionUpdate(u));
    } catch (err) {
      console.error("[wa] no se pudo iniciar:", err.message);
      this.#setStatus("disconnected");
    } finally {
      this.starting = false;
    }
    return this.getStatus();
  }

  async #onConnectionUpdate(u) {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      this.qr = await QRCode.toDataURL(qr).catch(() => null);
      this.#setStatus("qr");
      if (this.qr) this.io?.emit("wa:qr", { dataUrl: this.qr });
    }

    if (connection === "open") {
      this.qr = null;
      const number = numberFromJid(this.sock?.user?.id);
      store.setWhatsappMeta({ number, lastConnectionAt: new Date().toISOString() });
      this.#setStatus("connected");
      console.log(`[wa] conectado${number ? ` (${number})` : ""}`);
      this.sync().catch(() => undefined);
    } else if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut || this.manualStop) {
        this.#clearSession();
        this.#setStatus("disconnected");
        console.warn("[wa] sesión cerrada (logout). Hará falta un QR nuevo.");
      } else {
        this.#setStatus("connecting");
        setTimeout(() => this.connect().catch(() => undefined), 2000);
      }
    }
  }

  #trackContacts(rows) {
    if (!Array.isArray(rows)) return;
    for (const c of rows) if (c?.id) this.contacts.add(String(c.id));
    store.setWhatsappMeta({ contactsCount: this.contacts.size });
    this.io?.emit("wa:status", this.getStatus());
  }

  /** Sincroniza grupos (y refleja el conteo de contactos). */
  async sync() {
    let groups = [];
    try {
      const map = await this.sock?.groupFetchAllParticipating?.();
      groups = Object.values(map ?? {}).map((g) => ({
        id: g.id,
        subject: g.subject ?? g.id,
        size: g.participants?.length ?? g.size ?? 0,
      }));
    } catch (err) {
      console.warn("[wa] sync grupos falló:", err.message);
    }
    store.setGroups(groups);
    this.io?.emit("wa:groups", groups);
    this.io?.emit("wa:status", this.getStatus());
    return groups;
  }

  /**
   * Envía a un grupo: texto y, opcionalmente, un adjunto (imagen o documento).
   * `attachment` = { path, mime, filename, kind } donde path es el nombre de
   * archivo dentro de la carpeta de subidas.
   */
  async sendToGroup(groupId, text, attachment = null) {
    if (!this.isConnected() || !this.sock) throw new Error("WhatsApp no está conectado.");
    const jid = toGroupJid(groupId);

    if (attachment?.path) {
      const uploadDir = resolve(process.env.NSAP_UPLOAD_DIR ?? "data/uploads");
      const buffer = readFileSync(resolve(uploadDir, attachment.path));
      const msg =
        attachment.kind === "image"
          ? { image: buffer, caption: text || undefined }
          : { document: buffer, mimetype: attachment.mime, fileName: attachment.filename, caption: text || undefined };
      const res = await this.sock.sendMessage(jid, msg);
      return { id: res?.key?.id ?? "" };
    }

    const res = await this.sock.sendMessage(jid, { text });
    return { id: res?.key?.id ?? "" };
  }

  async disconnect() {
    this.manualStop = true;
    try {
      await this.sock?.logout?.();
    } catch {
      /* ignore */
    }
    this.#clearSession();
    this.#setStatus("disconnected");
    return this.getStatus();
  }

  #clearSession() {
    try {
      rmSync(SESSION_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.contacts.clear();
    store.setWhatsappMeta({ number: null, contactsCount: 0 });
    store.setGroups([]);
  }
}

export const whatsapp = new WhatsAppManager();
