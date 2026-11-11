/**
 * Rules for browser push (Web Push). Pure, tested.
 *
 * The server POSTs to the address a browser gives when it subscribes, so that
 * address must belong to a real browser push service: anything else (an
 * internal IP, another site) would let someone make our server call it.
 */
const PUSH_HOSTS: (string | RegExp)[] = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Opera, Brave, Samsung Internet
  "android.googleapis.com",
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari (macOS, iPhone/iPad with the app installed)
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => (typeof h === "string" ? h === host : h.test(host)));
}

/** Browser keys are base64url of fixed sizes (P-256 point and 16-byte secret). */
export function isPushKeys(p256dh: unknown, auth: unknown): boolean {
  const b64url = /^[A-Za-z0-9_-]+={0,2}$/;
  return (
    typeof p256dh === "string" &&
    typeof auth === "string" &&
    b64url.test(p256dh) &&
    b64url.test(auth) &&
    p256dh.length >= 80 &&
    p256dh.length <= 100 &&
    auth.length >= 20 &&
    auth.length <= 30
  );
}

/** What the phone shows for a new chat message: the contact and the start of the text. */
export function chatNotice(input: {
  workspaceSlug: string;
  workspaceName?: string | null;
  conversationId?: string | null;
  contactName: string;
  text: string;
  channel: string;
}): { title: string; body: string; url: string; tag: string } {
  const channel = input.channel === "tg" ? "Telegram" : input.channel === "wa" ? "WhatsApp" : "";
  const text = input.text.replace(/\s+/g, " ").trim();
  const body = text.length > 140 ? `${text.slice(0, 137)}…` : text || "Mensaje nuevo";
  const where = [channel, input.workspaceName].filter(Boolean).join(" · ");
  return {
    title: where ? `${input.contactName} (${where})` : input.contactName,
    body,
    url: `/w/${input.workspaceSlug}/inbox${input.conversationId ? `?c=${encodeURIComponent(input.conversationId)}` : ""}`,
    tag: `chat-${input.conversationId ?? input.workspaceSlug}`,
  };
}
