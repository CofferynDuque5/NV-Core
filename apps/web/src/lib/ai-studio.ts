/**
 * Pure AI Studio helpers — presets and text utilities, no React, unit-tested.
 */

export interface Preset {
  id: string;
  label: string;
}

export const FORMATS: Preset[] = [
  { id: "caption", label: "Caption" },
  { id: "anuncio", label: "Anuncio" },
  { id: "email", label: "Asunto de email" },
  { id: "bio", label: "Bio" },
  { id: "hilo", label: "Hilo" },
];

export const LENGTHS: Preset[] = [
  { id: "corto", label: "Corto" },
  { id: "medio", label: "Medio" },
  { id: "largo", label: "Largo" },
];

export const TONES = ["Entusiasta", "Profesional", "Cercano", "Urgente", "Divertido"];

/** Hashtag tokens already present in a text (lowercased). */
function existingTags(text: string): Set<string> {
  const found = text.toLowerCase().match(/#[\p{L}0-9_]+/gu) ?? [];
  return new Set(found);
}

/**
 * Append hashtags that aren't already in the text, on a fresh line.
 * Idempotent: re-merging the same tags is a no-op.
 */
export function mergeHashtags(text: string, tags: string[]): string {
  const have = existingTags(text);
  const add = tags
    .map((t) => t.trim())
    .filter((t) => t && !have.has(t.toLowerCase()));
  if (add.length === 0) return text;
  const base = text.trimEnd();
  return base.length ? `${base}\n\n${add.join(" ")}` : add.join(" ");
}

/** Word count of a caption (whitespace-separated). */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
