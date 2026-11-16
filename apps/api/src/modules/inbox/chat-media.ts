import { createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ChatMedia, ChatMediaKind } from "@nv/domain";

import { safeEqual } from "../../common/crypto/crypto.util";
import { WORKSPACE_DIR_RE, resolveMediaDir } from "../media/local-storage";

/**
 * Photos, audios, videos and documents of Inbox chats. They are private:
 * stored apart from the public uploads (<MEDIA_DIR>/<brand>/chat/), never
 * served by the public /api/files route, and only reachable with a signed link
 * that names the brand and the message and expires after a few hours. Pure
 * helpers (tested) plus the two file-system calls.
 */

/** Biggest attachment the panel downloads from WhatsApp (bigger ones: open them on the phone). */
export const CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
/** Biggest file a member can send from the panel. */
export const CHAT_SEND_MAX_BYTES = 16 * 1024 * 1024;
/** How long a media link works. */
export const MEDIA_LINK_TTL_MS = 6 * 60 * 60_000;

/** Stored chat files: 32 hex + our extension. */
export const CHAT_FILE_RE = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

interface ChatType {
  ext: string;
  /** Shown in the page (img/audio/video); everything else downloads. */
  inline: boolean;
}

/** What each type is stored and served as. Unknown types are kept as .bin and only download. */
const CHAT_TYPES: Record<string, ChatType> = {
  "image/jpeg": { ext: "jpg", inline: true },
  "image/png": { ext: "png", inline: true },
  "image/webp": { ext: "webp", inline: true },
  "image/gif": { ext: "gif", inline: true },
  "video/mp4": { ext: "mp4", inline: true },
  "video/3gpp": { ext: "3gp", inline: true },
  "video/quicktime": { ext: "mov", inline: true },
  "video/webm": { ext: "webm", inline: true },
  "audio/ogg": { ext: "ogg", inline: true },
  "audio/opus": { ext: "opus", inline: true },
  "audio/mpeg": { ext: "mp3", inline: true },
  "audio/mp4": { ext: "m4a", inline: true },
  "audio/aac": { ext: "aac", inline: true },
  "audio/webm": { ext: "weba", inline: true },
  "audio/amr": { ext: "amr", inline: false },
  "audio/wav": { ext: "wav", inline: true },
  "application/pdf": { ext: "pdf", inline: false },
  "application/msword": { ext: "doc", inline: false },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", inline: false },
  "application/vnd.ms-excel": { ext: "xls", inline: false },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", inline: false },
  "application/vnd.ms-powerpoint": { ext: "ppt", inline: false },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", inline: false },
  "application/zip": { ext: "zip", inline: false },
  "text/plain": { ext: "txt", inline: false },
  "text/csv": { ext: "csv", inline: false },
};

const BY_EXT = new Map(Object.entries(CHAT_TYPES).map(([mime, t]) => [t.ext, { mime, ...t }]));

export function cleanMime(mime: string | null | undefined): string {
  return String(mime ?? "").toLowerCase().split(";")[0]!.trim();
}

/** Extension a chat file of this type is stored with. */
export function chatFileExt(mime: string | null | undefined): string {
  return CHAT_TYPES[cleanMime(mime)]?.ext ?? "bin";
}

/** Headers for a stored chat file: our own type (never the sender's), inline only for media. */
export function chatFileHeaders(file: string, downloadName?: string | null): Record<string, string> {
  const ext = file.slice(file.lastIndexOf(".") + 1);
  const t = BY_EXT.get(ext);
  const type = t?.mime ?? "application/octet-stream";
  const inline = t?.inline ?? false;
  const safeName = (downloadName ?? `archivo.${ext}`).replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120) || `archivo.${ext}`;
  return {
    "Content-Type": type.startsWith("text/") ? `${type}; charset=utf-8` : type,
    "Content-Disposition": inline
      ? "inline"
      : `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=3600",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
  };
}

/** What the Message.media JSON holds. */
export interface StoredChatMedia {
  kind: ChatMediaKind;
  mime: string;
  size: number;
  name?: string;
  seconds?: number;
  /** Stored file name (private). */
  file?: string;
  /** Sealed WhatsApp message (encrypted) to download it later. */
  ref?: string;
  /** Why it can't be shown. */
  unavailable?: string;
}

/** The stored JSON → what the panel gets (never the sealed WhatsApp message). */
export function publicChatMedia(stored: StoredChatMedia, url: string | null): ChatMedia {
  const out: ChatMedia = { kind: stored.kind, mime: stored.mime, size: stored.size };
  if (stored.name) out.name = stored.name;
  if (stored.seconds) out.seconds = stored.seconds;
  if (stored.unavailable) out.unavailable = stored.unavailable;
  else if (url && (stored.file || stored.ref)) out.url = url;
  else if (!stored.file && !stored.ref) out.unavailable = "Ábrelo en tu teléfono.";
  return out;
}

export function readStoredMedia(value: unknown): StoredChatMedia | null {
  if (!value || typeof value !== "object") return null;
  const v = value as StoredChatMedia;
  return typeof v.kind === "string" && typeof v.mime === "string" ? v : null;
}

// ── Signed links ────────────────────────────────────────────────────────────

function sign(secret: string, payload: string): string {
  return createHmac("sha256", `chat-media:${secret}`).update(payload).digest("base64url");
}

/**
 * Link token for one message's attachment: brand + message + expiry, signed.
 * The expiry is rounded up to the hour so the link stays the same while the
 * chat refreshes (the browser keeps the photo cached instead of reloading it).
 */
export function mediaToken(secret: string, workspace: string, messageId: string, now = Date.now(), ttl = MEDIA_LINK_TTL_MS): string {
  const hour = 60 * 60_000;
  const expires = Math.ceil((now + ttl) / hour) * hour;
  const payload = `${workspace}.${messageId}.${Math.floor(expires / 1000).toString(36)}`;
  return `${payload}.${sign(secret, payload)}`;
}

/** The brand and message a token opens, or null when it's forged, malformed or expired. */
export function readMediaToken(secret: string, token: string, now = Date.now()): { workspace: string; messageId: string } | null {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 4) return null;
  const [workspace, messageId, exp, sig] = parts as [string, string, string, string];
  if (!WORKSPACE_DIR_RE.test(workspace) || !/^[a-z0-9]{10,40}$/i.test(messageId)) return null;
  if (!safeEqual(sig, sign(secret, `${workspace}.${messageId}.${exp}`))) return null;
  const expires = parseInt(exp, 36) * 1000;
  if (!Number.isFinite(expires) || expires < now) return null;
  return { workspace, messageId };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export function chatDir(mediaDir: string, workspace: string): string {
  if (!WORKSPACE_DIR_RE.test(workspace)) throw new Error("Marca no válida.");
  return join(resolveMediaDir(mediaDir), workspace, "chat");
}

/** Save a chat file with a random name; returns that name. */
export async function saveChatFile(mediaDir: string, workspace: string, bytes: Buffer, mime: string): Promise<string> {
  const dir = chatDir(mediaDir, workspace);
  await mkdir(dir, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${chatFileExt(mime)}`;
  await writeFile(join(dir, name), bytes, { flag: "wx", mode: 0o640 });
  return name;
}

// ── Sending from the panel ──────────────────────────────────────────────────

const startsWith = (h: Buffer, bytes: number[], offset = 0) =>
  h.length >= offset + bytes.length && bytes.every((b, i) => h[offset + i] === b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/**
 * What a file a member wants to send really is, from its first bytes (never
 * from the name or the type the browser claims). Null = not allowed.
 */
export function sniffSendable(bytes: Buffer, claimedMime: string): { kind: "image" | "video" | "audio" | "voice" | "document"; mime: string } | null {
  const claimed = cleanMime(claimedMime);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mime: "image/png" };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return { kind: "image", mime: "image/webp" };
  if (startsWith(bytes, ascii("GIF8"))) return { kind: "image", mime: "image/gif" };
  if (startsWith(bytes, ascii("OggS"))) return { kind: "voice", mime: "audio/ogg" };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return claimed.startsWith("audio/") ? { kind: "voice", mime: "audio/webm" } : { kind: "video", mime: "video/webm" };
  }
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    return claimed.startsWith("audio/") ? { kind: "audio", mime: "audio/mp4" } : { kind: "video", mime: "video/mp4" };
  }
  if (startsWith(bytes, ascii("ID3")) || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return { kind: "audio", mime: "audio/mpeg" };
  }
  if (startsWith(bytes, ascii("%PDF-"))) return { kind: "document", mime: "application/pdf" };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const office = CHAT_TYPES[claimed] && claimed.startsWith("application/vnd.openxmlformats") ? claimed : "application/zip";
    return { kind: "document", mime: office };
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    const legacy = ["application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"].includes(claimed)
      ? claimed
      : "application/msword";
    return { kind: "document", mime: legacy };
  }
  if ((claimed === "text/plain" || claimed === "text/csv") && !bytes.subarray(0, 4096).includes(0)) {
    return { kind: "document", mime: claimed };
  }
  return null;
}

/** Label kept as the message text (preview, search) for an attachment. */
export function mediaLabel(kind: ChatMediaKind, name?: string | null, caption?: string | null): string {
  const base =
    kind === "image"
      ? "📷 Foto"
      : kind === "video"
        ? "🎥 Video"
        : kind === "voice"
          ? "🎤 Nota de voz"
          : kind === "audio"
            ? "🎵 Audio"
            : kind === "sticker"
              ? "Sticker"
              : `📄 ${name || "Documento"}`;
  return caption?.trim() ? `${base} ${caption.trim()}` : base;
}
