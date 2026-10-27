import { randomBytes } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

/**
 * Archivos guardados en el propio servidor (sin Cloudinary).
 *
 * Solo se aceptan los tipos de esta lista. La extensión con la que se guarda
 * sale de aquí (nunca del nombre que manda el navegador) y el contenido se
 * compara con la firma del formato, así nadie sube un .html disfrazado de
 * imagen para servirlo desde nuestro dominio.
 */
export type StoredKind = "image" | "video" | "document";

interface FileSpec {
  ext: string;
  kind: StoredKind;
  /** First bytes check; returns true when the content really is this format. */
  sniff: (head: Buffer) => boolean;
}

const startsWith = (head: Buffer, bytes: number[], offset = 0) =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

const isJpeg = (h: Buffer) => startsWith(h, [0xff, 0xd8, 0xff]);
const isPng = (h: Buffer) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (h: Buffer) => startsWith(h, ascii("GIF8"));
const isWebp = (h: Buffer) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8);
/** MP4 / MOV (ISO base media): "ftyp" box at offset 4. */
const isIsoMedia = (h: Buffer) => startsWith(h, ascii("ftyp"), 4);
const isWebm = (h: Buffer) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]);
const isPdf = (h: Buffer) => startsWith(h, ascii("%PDF-"));
/** docx/xlsx/pptx are zip files. */
const isZip = (h: Buffer) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]);
/** Legacy doc/xls/ppt (OLE compound file). */
const isOle = (h: Buffer) => startsWith(h, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** Plain text: no NUL bytes in the first block. */
const isText = (h: Buffer) => !h.includes(0);

export const ALLOWED_FILES: Record<string, FileSpec> = {
  "image/jpeg": { ext: "jpg", kind: "image", sniff: isJpeg },
  "image/png": { ext: "png", kind: "image", sniff: isPng },
  "image/gif": { ext: "gif", kind: "image", sniff: isGif },
  "image/webp": { ext: "webp", kind: "image", sniff: isWebp },
  "video/mp4": { ext: "mp4", kind: "video", sniff: isIsoMedia },
  "video/quicktime": { ext: "mov", kind: "video", sniff: isIsoMedia },
  "video/webm": { ext: "webm", kind: "video", sniff: isWebm },
  "application/pdf": { ext: "pdf", kind: "document", sniff: isPdf },
  "application/msword": { ext: "doc", kind: "document", sniff: isOle },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    kind: "document",
    sniff: isZip,
  },
  "application/vnd.ms-excel": { ext: "xls", kind: "document", sniff: isOle },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: "xlsx",
    kind: "document",
    sniff: isZip,
  },
  "application/vnd.ms-powerpoint": { ext: "ppt", kind: "document", sniff: isOle },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: "pptx",
    kind: "document",
    sniff: isZip,
  },
  "text/plain": { ext: "txt", kind: "document", sniff: isText },
  "text/csv": { ext: "csv", kind: "document", sniff: isText },
};

/** Content-Type to serve each stored extension with (never the client's). */
export const CONTENT_TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_FILES).map(([mime, spec]) => [
    spec.ext,
    spec.kind === "document" && mime.startsWith("text/") ? `${mime}; charset=utf-8` : mime,
  ]),
);

/** Images and video play inline; documents always download. */
export function servesInline(ext: string): boolean {
  const spec = Object.values(ALLOWED_FILES).find((s) => s.ext === ext);
  return spec ? spec.kind !== "document" || ext === "pdf" : false;
}

export function fileSpec(mime: string | undefined): FileSpec | undefined {
  return mime ? ALLOWED_FILES[mime.toLowerCase().split(";")[0]!.trim()] : undefined;
}

/** Random, unguessable stored name: 32 hex chars + our extension. */
export function storedFileName(ext: string): string {
  return `${randomBytes(16).toString("hex")}.${ext}`;
}

/** Only names we generate can be served (no path tricks, no dotfiles). */
export const STORED_NAME_RE = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
/** Workspace folder names are slugs. */
export const WORKSPACE_DIR_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/** Name shown to people: the original file name without folders, trimmed. */
export function displayName(original: string | undefined, fallback: string): string {
  const base = Array.from((original ?? "").split(/[\\/]/).pop() ?? "")
    .filter((c) => c.charCodeAt(0) >= 0x20)
    .join("")
    .trim();
  return (base || fallback).slice(0, 255);
}

/** Absolute storage folder; relative paths resolve from the app's folder. */
export function resolveMediaDir(dir: string): string {
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/** Public URL of a stored file. */
export function publicFileUrl(publicBase: string, workspace: string, name: string): string {
  return `${publicBase}/api/files/${workspace}/${name}`;
}
