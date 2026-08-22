import type { AppConfig } from "../../config/configuration";
import type { MediaAttachment } from "../../providers/provider.types";

/**
 * Low-level HTTP transport for the official WhatsApp Cloud API and Telegram Bot
 * API. These are pure functions (no NestJS, no DI) consumed only by the
 * corresponding provider adapters — they are the single place that touches
 * those external HTTP endpoints.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface OutboundMessage {
  channel: string;
  to: string;
  body: string;
}

// ── Error taxonomy ───────────────────────────────────────────────────────────
// Meta returns errors as { error: { message, code, error_subcode, type } }.
// Classifying them lets callers react correctly: back off on rate limits, stop
// and alert on auth failures, retry transient media/network errors, and surface
// recipient-window problems to the operator instead of retrying forever.
export type WhatsAppErrorKind = "auth" | "rate_limit" | "media" | "recipient" | "transient" | "unknown";

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly kind: WhatsAppErrorKind,
    readonly httpStatus: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }

  /** Whether a retry (with backoff) could plausibly succeed. */
  get retriable(): boolean {
    return this.kind === "rate_limit" || this.kind === "transient";
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

/** Classify a Meta Graph error response into an actionable WhatsAppApiError. */
export function classifyWhatsAppError(status: number, body: unknown): WhatsAppApiError {
  const err = (body as GraphErrorBody)?.error;
  const code = err?.code;
  const subcode = err?.error_subcode;
  const msg = err?.message || `HTTP ${status}`;

  let kind: WhatsAppErrorKind = "unknown";
  if (code === 190 || err?.type === "OAuthException") {
    kind = "auth"; // expired / invalid / revoked access token
  } else if (code !== undefined && [4, 613, 80007, 130429, 131048].includes(code)) {
    kind = "rate_limit"; // app or messaging throttling / spam rate limit
  } else if (code !== undefined && [131052, 131053].includes(code)) {
    kind = "media"; // media download / upload failed
  } else if (code !== undefined && [131026, 131047, 131051].includes(code)) {
    kind = "recipient"; // undeliverable / outside 24h window / unsupported type
  } else if (status >= 500) {
    kind = "transient"; // Meta-side error, safe to retry
  }
  return new WhatsAppApiError(`WhatsApp: ${msg}`, kind, status, code, subcode);
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

async function whatsappPost(
  wa: AppConfig["integrations"]["whatsapp"],
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  if (!wa.phoneNumberId || !wa.token) {
    throw new WhatsAppApiError("WhatsApp Cloud API sin configurar.", "auth", 0);
  }
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${encodeURIComponent(wa.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${wa.token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
  } catch (e) {
    // Network / DNS / connection error — transient by nature.
    throw new WhatsAppApiError(`WhatsApp: red no disponible (${(e as Error).message})`, "transient", 0);
  }
  const data = await parseJson(res);
  if (!res.ok) throw classifyWhatsAppError(res.status, data);
  const id = (data as { messages?: { id?: string }[] }).messages?.[0]?.id ?? "";
  return { id };
}

/** Send a plain text WhatsApp message via the Cloud API. */
export function sendWhatsApp(
  wa: AppConfig["integrations"]["whatsapp"],
  msg: OutboundMessage,
): Promise<{ id: string }> {
  return whatsappPost(wa, { to: msg.to, type: "text", text: { body: msg.body } });
}

/** WhatsApp media types the Cloud API accepts by public link. */
function mediaType(kind?: string): "image" | "video" | "document" {
  if (kind === "image" || kind === "video") return kind;
  return "document";
}

/**
 * Send a media WhatsApp message (image / video / document) by public URL.
 * Caption is supported by all three types; document additionally carries a
 * filename. The media is delivered by link (Cloud API fetches it) — no upload.
 */
export function sendWhatsAppMedia(
  wa: AppConfig["integrations"]["whatsapp"],
  input: { to: string; body?: string; attachment: MediaAttachment },
): Promise<{ id: string }> {
  const type = mediaType(input.attachment.kind);
  const media: Record<string, unknown> = { link: input.attachment.url };
  if (input.body) media.caption = input.body;
  if (type === "document" && input.attachment.filename) media.filename = input.attachment.filename;
  return whatsappPost(wa, { to: input.to, type, [type]: media });
}

/**
 * Send a pre-approved WhatsApp template message (the only way to initiate a
 * conversation outside the 24h customer-service window). Body variables map to
 * the template's body {{1}}, {{2}}… positional parameters.
 */
export function sendWhatsAppTemplate(
  wa: AppConfig["integrations"]["whatsapp"],
  input: { to: string; template: string; language?: string; variables?: string[] },
): Promise<{ id: string }> {
  const components =
    input.variables && input.variables.length > 0
      ? [{ type: "body", parameters: input.variables.map((text) => ({ type: "text", text })) }]
      : undefined;
  return whatsappPost(wa, {
    to: input.to,
    type: "template",
    template: {
      name: input.template,
      language: { code: input.language || "es" },
      ...(components ? { components } : {}),
    },
  });
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`;
}

export async function sendTelegram(
  tg: AppConfig["integrations"]["telegram"],
  msg: OutboundMessage,
): Promise<{ id: string }> {
  const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: msg.to, text: msg.body }),
  });
  if (!res.ok) throw new Error(`Telegram: ${await readError(res)}`);
  const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
  if (!data.ok) throw new Error("Telegram: respuesta no OK");
  return { id: String(data.result?.message_id ?? "") };
}

/** The Telegram Bot API method + payload field for a media kind. */
function telegramMedia(kind?: string): { method: string; field: string } {
  if (kind === "video") return { method: "sendVideo", field: "video" };
  if (kind === "image") return { method: "sendPhoto", field: "photo" };
  return { method: "sendDocument", field: "document" };
}

/**
 * Send media (image / video / document) to a Telegram chat, group, or channel
 * by public URL. The bot must be a member (or admin, for channels). Caption is
 * supported by all three types.
 */
export async function sendTelegramMedia(
  tg: AppConfig["integrations"]["telegram"],
  input: { to: string; body?: string; attachment: MediaAttachment },
): Promise<{ id: string }> {
  const { method, field } = telegramMedia(input.attachment.kind);
  const payload: Record<string, unknown> = { chat_id: input.to, [field]: input.attachment.url };
  if (input.body) payload.caption = input.body;
  const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Telegram: ${await readError(res)}`);
  const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
  if (!data.ok) throw new Error("Telegram: respuesta no OK");
  return { id: String(data.result?.message_id ?? "") };
}
