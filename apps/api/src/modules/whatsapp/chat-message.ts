import { numberFromJid } from "./whatsapp.types";

/**
 * Turns raw Baileys messages into what the Inbox stores. Pure, so the parsing
 * of WhatsApp's many message shapes is unit-tested without a socket.
 */

/** One 1:1 chat message ready for the Inbox. */
export interface ChatMessage {
  /** Phone in E.164 ("+584121234567"). */
  handle: string;
  /** The contact's own WhatsApp name (pushName); only on messages they sent. */
  name: string | null;
  text: string;
  direction: "in" | "out";
  at: Date;
  /** WhatsApp message id, to store each message once. */
  externalId: string | null;
}

/** Most recent messages kept per chat when the history arrives after linking. */
export const HISTORY_PER_CHAT = 30;

const PN = "@s.whatsapp.net";
const LID = "@lid";

/**
 * Phone-number JID of a 1:1 chat. Newer WhatsApp hides the number behind a
 * "@lid" id; Baileys then puts the real one in `remoteJidAlt` (or `senderPn`),
 * and `lidToPn` holds the ones learnt from the contact list. Groups, status and
 * channels return null; an unresolved "@lid" returns it as is.
 */
export function chatJid(key: any, lidToPn?: Map<string, string>): string | null {
  const jid: string = key?.remoteJid ?? "";
  if (jid.endsWith(PN)) return jid;
  if (!jid.endsWith(LID)) return null;
  for (const alt of [key?.remoteJidAlt, key?.senderPn]) {
    if (typeof alt === "string" && alt.endsWith(PN)) return alt;
  }
  return lidToPn?.get(jid) ?? jid;
}

/** Unwrap the containers WhatsApp puts around the real content. */
function inner(message: any): any {
  let m = message;
  for (let i = 0; i < 4 && m; i++) {
    const next =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.viewOnceMessageV2Extension?.message ??
      m.documentWithCaptionMessage?.message ??
      m.editedMessage?.message;
    if (!next) break;
    m = next;
  }
  return m;
}

/**
 * Readable text of a message: the text or caption, or a short label for media
 * («📷 Foto»). Empty for things that aren't chat messages (reactions, receipts,
 * protocol and system messages).
 */
export function messageText(message: any): string {
  const m = inner(message);
  if (!m) return "";
  const text: string | undefined = m.conversation ?? m.extendedTextMessage?.text;
  if (text?.trim()) return text;
  const withCaption = (label: string, caption?: string | null) => (caption?.trim() ? `${label} ${caption}` : label);
  if (m.imageMessage) return withCaption("📷 Foto", m.imageMessage.caption);
  if (m.videoMessage) return withCaption(m.videoMessage.gifPlayback ? "🎞️ GIF" : "🎥 Video", m.videoMessage.caption);
  if (m.audioMessage) return m.audioMessage.ptt ? "🎤 Nota de voz" : "🎵 Audio";
  if (m.documentMessage)
    return withCaption(`📄 ${m.documentMessage.fileName || "Documento"}`, m.documentMessage.caption);
  if (m.stickerMessage) return "Sticker";
  if (m.locationMessage || m.liveLocationMessage) return "📍 Ubicación";
  if (m.contactMessage) return `👤 Contacto: ${m.contactMessage.displayName || "sin nombre"}`;
  if (m.contactsArrayMessage) return "👤 Contactos";
  if (m.pollCreationMessage || m.pollCreationMessageV3)
    return `📊 Encuesta: ${(m.pollCreationMessage ?? m.pollCreationMessageV3).name ?? ""}`.trim();
  if (m.buttonsResponseMessage) return m.buttonsResponseMessage.selectedDisplayText ?? "";
  if (m.listResponseMessage) return m.listResponseMessage.title ?? "";
  if (m.templateButtonReplyMessage) return m.templateButtonReplyMessage.selectedDisplayText ?? "";
  return "";
}

/** Seconds (number or protobuf Long) → Date; falls back to now. */
export function messageDate(ts: unknown, now = new Date()): Date {
  const n =
    typeof ts === "number"
      ? ts
      : typeof ts === "string"
        ? Number(ts)
        : ts && typeof (ts as { toNumber?: () => number }).toNumber === "function"
          ? (ts as { toNumber: () => number }).toNumber()
          : Number((ts as { low?: number })?.low ?? NaN);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : now;
}

/** A Baileys message → Inbox message, or null when it doesn't belong there. */
export function toChatMessage(m: any, lidToPn?: Map<string, string>, now = new Date()): ChatMessage | null {
  const jid = chatJid(m?.key, lidToPn);
  if (!jid || !jid.endsWith(PN)) return null;
  const handle = numberFromJid(jid);
  if (!handle) return null;
  const text = messageText(m?.message);
  if (!text.trim()) return null;
  const fromMe = Boolean(m?.key?.fromMe);
  const pushName = typeof m?.pushName === "string" ? m.pushName.trim() : "";
  return {
    handle,
    // On our own messages pushName is the operator's name, never the contact's.
    name: !fromMe && pushName ? pushName : null,
    text,
    direction: fromMe ? "out" : "in",
    at: messageDate(m?.messageTimestamp, now),
    externalId: typeof m?.key?.id === "string" ? m.key.id : null,
  };
}

/** The history WhatsApp sends after linking → the last N messages per chat, oldest first. */
export function historyMessages(rows: any[], lidToPn?: Map<string, string>, perChat = HISTORY_PER_CHAT): ChatMessage[] {
  const byChat = new Map<string, ChatMessage[]>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const msg = toChatMessage(row, lidToPn);
    if (!msg) continue;
    const list = byChat.get(msg.handle) ?? [];
    list.push(msg);
    byChat.set(msg.handle, list);
  }
  const out: ChatMessage[] = [];
  for (const list of byChat.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    out.push(...list.slice(-perChat));
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Best name of a WhatsApp contact: as saved in the phone, else their own profile name. */
export function contactName(c: any): string | null {
  for (const v of [c?.name, c?.notify, c?.verifiedName]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Phone-number JID of a contact-list entry (its id, or `phoneNumber` when the id is a LID). */
export function contactPnJid(c: any): string | null {
  for (const v of [c?.id, c?.phoneNumber, c?.jid]) {
    if (typeof v === "string" && v.endsWith(PN)) return v;
  }
  return null;
}

/** LID of a contact-list entry, when WhatsApp sent one. */
export function contactLid(c: any): string | null {
  for (const v of [c?.lid, c?.id]) {
    if (typeof v === "string" && v.endsWith(LID)) return v;
  }
  return null;
}
