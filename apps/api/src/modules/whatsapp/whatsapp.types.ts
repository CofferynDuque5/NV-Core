export type WhatsappStatusValue = "disconnected" | "connecting" | "qr" | "connected";

export interface WhatsappStatus {
  status: WhatsappStatusValue;
  provider: "baileys";
  number: string | null;
  lastConnectionAt: string | null;
  groupsCount: number;
  contactsCount: number;
}

/** A WhatsApp group as fetched from Baileys. */
export interface WhatsappGroup {
  remoteJid: string;
  subject: string;
  size: number;
}

/** Media descriptor for a WhatsApp send (delivered by public URL). */
export interface WhatsappAttachment {
  url: string;
  kind?: "image" | "video" | "document" | string;
  mime?: string | null;
  filename?: string | null;
}

/** Callbacks a BaileysSession uses to report changes back to the service. */
export interface SessionEvents {
  onQr(workspaceSlug: string, dataUrl: string): void;
  onStatus(workspaceSlug: string, status: WhatsappStatusValue): void;
  onMeta(
    workspaceSlug: string,
    meta: { number?: string | null; groupsCount?: number; contactsCount?: number; connectedAt?: Date },
  ): void;
  /** Full group list after a sync, so the service can persist it. */
  onGroups(workspaceSlug: string, groups: WhatsappGroup[]): void;
}

/** Load the ESM-only Baileys package from CommonJS without TS turning it into require(). */
const nativeImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
let cached: Promise<Record<string, unknown>> | null = null;
export function loadBaileys(): Promise<Record<string, unknown>> {
  return (cached ??= nativeImport("@whiskeysockets/baileys") as Promise<Record<string, unknown>>);
}

/** Minimal pino-compatible silent logger Baileys accepts. */
export function silentLogger(): Record<string, unknown> {
  const noop = () => undefined;
  const logger: Record<string, unknown> = {
    level: "silent",
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  };
  logger.child = () => logger;
  return logger;
}

/** Normalize a phone/handle to a WhatsApp JID. */
export function toJid(to: string): string {
  if (to.includes("@")) return to;
  const digits = to.replace(/[^0-9]/g, "");
  return `${digits}@s.whatsapp.net`;
}

/** Extract the phone number from a Baileys user id like "5215512345678:12@s.whatsapp.net". */
export function numberFromJid(jid: string | undefined | null): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0]?.split(":")[0]?.replace(/[^0-9]/g, "");
  return digits ? `+${digits}` : null;
}
