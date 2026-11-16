/** Helpers for photos, audios and files in the Inbox. Pure, tested. */

export function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** 75 → "1:15". */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Most a member can send from the panel (the server checks it again). */
export const SEND_MAX_BYTES = 16 * 1024 * 1024;
/** Longest voice note recorded in the panel. */
export const VOICE_MAX_SECONDS = 5 * 60;

/** What the file picker offers. */
export const ATTACH_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

/**
 * Best recording format this browser has, in WhatsApp's order of preference:
 * Ogg/Opus is a real voice note; WebM/Opus becomes one on the server; MP4/AAC
 * (Safari) goes as an audio.
 */
export function voiceMimeType(isSupported: (type: string) => boolean): string | null {
  for (const t of ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (isSupported(t)) return t;
  }
  return null;
}

/** File name for a recording, by format. */
export function voiceFileName(mime: string): string {
  return mime.startsWith("audio/ogg") ? "nota-de-voz.ogg" : mime.startsWith("audio/mp4") ? "nota-de-voz.m4a" : "nota-de-voz.webm";
}
