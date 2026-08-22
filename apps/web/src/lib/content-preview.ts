import { getChannel, type CampaignAttachment, type ChannelId } from "@nv/domain";

/**
 * Pure helpers behind the unified content editor's live preview: render the
 * message with sample variables, pick the visual to show, and decide which
 * channel surfaces to mock up (WhatsApp chat/status, Telegram, Facebook,
 * Instagram) from what the campaign has enabled. Presentation lives in the
 * ContentPreview component; the decisions live here so they can be tested.
 */

/** A channel surface the content will appear on. */
export type PreviewSurfaceId = "wa" | "wa_status" | "tg" | "fb" | "ig" | "generic";

export interface PreviewSurface {
  id: PreviewSurfaceId;
  label: string;
  /** IG only: "feed" | "reel" | "story" | "carousel". */
  format?: string;
}

export interface PreviewContent {
  /** Message with {{variables}} substituted for sample values. */
  text: string;
  /** First image/video attachment to show, if any. */
  visual: CampaignAttachment | null;
  /** How many attachments in total (for the carousel hint). */
  attachmentsCount: number;
}

/** Replace {{key}} tokens with sample values; unknown tokens are left as-is. */
export function renderPreview(template: string, vars: Record<string, string>): string {
  return (template ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => vars[key] ?? m);
}

/** Sample values for the builtin campaign variables ({{grupo}}, {{fecha}}, {{hora}}). */
export function previewVars(groupName?: string, now: Date = new Date()): Record<string, string> {
  return {
    grupo: groupName?.trim() || "Mi grupo",
    fecha: now.toLocaleDateString("es-MX"),
    hora: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** The first image/video attachment with a URL, or null. */
export function firstVisual(attachments: CampaignAttachment[] | undefined): CampaignAttachment | null {
  const list = attachments ?? [];
  return list.find((a) => Boolean(a.url) && (a.kind === "image" || a.kind === "video")) ?? null;
}

/**
 * The channel surfaces the content will publish to. Order matches the compose
 * flow (chat → status → social). When nothing is enabled yet, falls back to a
 * single WhatsApp chat mock so the preview is never blank.
 */
export function previewSurfaces(opts: {
  hasWaGroup?: boolean;
  hasTgGroup?: boolean;
  waStatus?: boolean;
  fb?: boolean;
  ig?: boolean;
  igFormat?: string;
}): PreviewSurface[] {
  const surfaces: PreviewSurface[] = [];
  if (opts.hasWaGroup) surfaces.push({ id: "wa", label: "WhatsApp" });
  if (opts.hasTgGroup) surfaces.push({ id: "tg", label: "Telegram" });
  if (opts.waStatus) surfaces.push({ id: "wa_status", label: "Estado de WhatsApp" });
  if (opts.fb) surfaces.push({ id: "fb", label: "Facebook" });
  if (opts.ig) surfaces.push({ id: "ig", label: "Instagram", format: opts.igFormat || "feed" });
  if (surfaces.length === 0) surfaces.push({ id: "wa", label: "WhatsApp" });
  return surfaces;
}

/**
 * The preview surface for a single channel (used by the calendar post composer,
 * which schedules one post to one channel). WhatsApp/Telegram/Facebook/Instagram
 * get their dedicated mockups; every other channel gets a generic post card
 * labeled with the channel's name.
 */
export function surfaceForChannel(
  channel: ChannelId,
  opts: { igFormat?: string } = {},
): PreviewSurface {
  switch (channel) {
    case "wa":
      return { id: "wa", label: "WhatsApp" };
    case "tg":
      return { id: "tg", label: "Telegram" };
    case "fb":
      return { id: "fb", label: "Facebook" };
    case "ig":
      return { id: "ig", label: "Instagram", format: opts.igFormat || "feed" };
    default:
      return { id: "generic", label: getChannel(channel).name };
  }
}

/** Build the rendered preview content (text + visual) for a campaign draft. */
export function buildPreviewContent(opts: {
  message: string;
  attachments?: CampaignAttachment[];
  groupName?: string;
  now?: Date;
}): PreviewContent {
  const text = renderPreview(opts.message, previewVars(opts.groupName, opts.now));
  return {
    text,
    visual: firstVisual(opts.attachments),
    attachmentsCount: (opts.attachments ?? []).filter((a) => a.url).length,
  };
}
