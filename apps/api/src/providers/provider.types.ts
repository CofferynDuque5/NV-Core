/**
 * Provider + Adapter contracts.
 *
 * Every external channel (WhatsApp, Facebook, Instagram, Email, TikTok) is a
 * `Provider`. A provider exposes one or more interchangeable `ChannelAdapter`
 * implementations (e.g. WhatsApp → Baileys | Cloud API). The rest of the system
 * NEVER talks to an external API directly — it goes through `ProviderManager`,
 * which resolves the active adapter for the workspace and delegates to it.
 *
 * Swapping providers (or their adapter) is a configuration change, not a code
 * change: pick the active adapter per workspace in the Conexiones module.
 */

/** The providers the platform manages. */
export const PROVIDER_IDS = [
  "whatsapp",
  "telegram",
  "facebook",
  "instagram",
  "email",
  "tiktok",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Execution context handed to every adapter call. */
export interface AdapterContext {
  workspaceSlug: string;
}

/** Normalized connection state, shared by all adapters. */
export type AdapterState = "connected" | "connecting" | "qr" | "disconnected" | "unconfigured";

export interface AdapterStatus {
  provider: ProviderId;
  adapter: string;
  state: AdapterState;
  /** Human-readable detail (number, page name, error…). */
  detail?: string | null;
  /** Optional QR data URL (WhatsApp Baileys). */
  qr?: string | null;
  meta?: Record<string, unknown>;
}

export interface HealthResult {
  provider: ProviderId;
  adapter: string;
  healthy: boolean;
  /** Whether the adapter has everything it needs to operate. */
  configured: boolean;
  message?: string;
}

/** A media attachment, delivered by public URL. */
export interface MediaAttachment {
  url: string;
  kind?: "image" | "video" | "document" | string;
  mime?: string | null;
  filename?: string | null;
}

/** Outbound direct message (chat channels). */
export interface SendMessageInput {
  to: string;
  body: string;
}

/** Outbound message with media (chat channels). */
export interface SendMediaInput {
  to: string;
  body?: string;
  attachment: MediaAttachment;
}

/** Social publish (feed channels). */
export interface PublishInput {
  message?: string;
  attachments?: MediaAttachment[];
  /** feed | reel | story | carousel (social) — provider decides support. */
  format?: string | null;
}

export interface SendResult {
  id: string;
}

export interface PublishResult {
  ok: boolean;
  id?: string;
  format?: string | null;
  error?: string;
}

/**
 * The uniform contract every adapter implements. Adapters that don't support a
 * capability throw {@link AdapterUnsupportedError} — the manager surfaces that
 * as a clear 501/503 rather than a silent no-op.
 */
export interface ChannelAdapter {
  /** Stable id, unique within its provider (e.g. "baileys", "cloud-api"). */
  readonly id: string;
  /** Human label for the Conexiones UI. */
  readonly label: string;
  /** Provider this adapter belongs to. */
  readonly provider: ProviderId;

  connect(ctx: AdapterContext): Promise<AdapterStatus>;
  disconnect(ctx: AdapterContext): Promise<AdapterStatus>;
  authenticate(ctx: AdapterContext): Promise<AdapterStatus>;
  refreshCredentials(ctx: AdapterContext): Promise<AdapterStatus>;
  publish(ctx: AdapterContext, input: PublishInput): Promise<PublishResult>;
  sendMessage(ctx: AdapterContext, input: SendMessageInput): Promise<SendResult>;
  sendMedia(ctx: AdapterContext, input: SendMediaInput): Promise<SendResult>;
  healthCheck(ctx: AdapterContext): Promise<HealthResult>;
  getStatus(ctx: AdapterContext): Promise<AdapterStatus>;
}

/** A provider bundles its adapters and knows which is the default. */
export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly defaultAdapterId: string;
  readonly adapters: ChannelAdapter[];
  adapter(id: string): ChannelAdapter | undefined;
}

/** Thrown when an adapter is asked for a capability it does not implement. */
export class AdapterUnsupportedError extends Error {
  constructor(adapter: string, capability: string) {
    super(`El adapter "${adapter}" no soporta "${capability}".`);
    this.name = "AdapterUnsupportedError";
  }
}
