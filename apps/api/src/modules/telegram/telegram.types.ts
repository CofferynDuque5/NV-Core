/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Connection state of a Telegram (MTProto/user) session, mirrors WhatsApp.
 * "password" = the scanned account has 2FA; waiting for the user's password.
 */
export type TelegramStatusValue =
  | "disconnected"
  | "connecting"
  | "qr"
  | "password"
  | "connected";

export interface TelegramStatus {
  status: TelegramStatusValue;
  provider: "mtproto";
  username: string | null;
  phone: string | null;
  lastConnectionAt: string | null;
  groupsCount: number;
  /** Last failure reason, surfaced in the panel (null when healthy). */
  error?: string | null;
}

/** A Telegram dialog (group or channel) fetched from the account. */
export interface TelegramDialog {
  remoteJid: string; // stringified peer id
  title: string;
  members: number;
  kind: "group" | "channel";
}

export interface TelegramAttachment {
  url: string;
  kind?: "image" | "video" | "document" | string;
  mime?: string | null;
  filename?: string | null;
}

/** Callbacks a TelegramUserSession uses to report changes back to the service. */
export interface TelegramSessionEvents {
  onQr(workspaceSlug: string, dataUrl: string): void;
  onStatus(workspaceSlug: string, status: TelegramStatusValue): void;
  onMeta(
    workspaceSlug: string,
    meta: { username?: string | null; phone?: string | null; groupsCount?: number; connectedAt?: Date },
  ): void;
  onDialogs(workspaceSlug: string, dialogs: TelegramDialog[]): void;
  /** A direct (private) inbound message, for the Inbox. */
  onInbound(
    workspaceSlug: string,
    msg: { contactHandle: string; contactName: string; text: string },
  ): void;
  /** A connection problem worth alerting the user about (drop, reconnect…). */
  onAlert(workspaceSlug: string, alert: { level: "warning" | "error"; reason: string }): void;
}

/**
 * Load GramJS (the `telegram` package) via CommonJS require. The API is built to
 * CommonJS (nest build), so require resolves the package and its subpaths;
 * `eval("require")` keeps the bundler/tsc from statically resolving its types.
 */
let cached: {
  TelegramClient: any;
  StringSession: any;
  Api: any;
  CustomFile: any;
  NewMessage: any;
} | null = null;

export function loadGram(): {
  TelegramClient: any;
  StringSession: any;
  Api: any;
  CustomFile: any;
  NewMessage: any;
} {
  if (cached) return cached;
  const req = eval("require") as NodeRequire;
  const core = req("telegram");
  const sessions = req("telegram/sessions");
  const uploads = req("telegram/client/uploads");
  const events = req("telegram/events");
  cached = {
    TelegramClient: core.TelegramClient,
    Api: core.Api,
    StringSession: sessions.StringSession,
    CustomFile: uploads.CustomFile,
    NewMessage: events.NewMessage,
  };
  return cached;
}
