/** A normalized inbound message from any messaging provider. */
export interface InboundMessage {
  channel: "wa" | "tg";
  contactHandle: string;
  contactName: string;
  text: string;
}

/**
 * Parse a WhatsApp Cloud API webhook body into inbound messages. Pure — tested.
 * Shape: entry[].changes[].value.{ messages[], contacts[] }.
 */
export function parseWhatsAppInbound(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const messages = value?.messages as
        | { from?: string; type?: string; text?: { body?: string } }[]
        | undefined;
      const contacts = value?.contacts as
        | { wa_id?: string; profile?: { name?: string } }[]
        | undefined;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        if (msg.type !== "text" || !msg.from || !msg.text?.body) continue;
        const contact = contacts?.find((c) => c.wa_id === msg.from);
        out.push({
          channel: "wa",
          contactHandle: msg.from,
          contactName: contact?.profile?.name?.trim() || msg.from,
          text: msg.text.body,
        });
      }
    }
  }
  return out;
}

/**
 * Parse a Telegram Bot API update into an inbound message (or null). Pure — tested.
 * Shape: { message: { chat: { id, first_name, ... }, text } }.
 */
export function parseTelegramInbound(body: unknown): InboundMessage | null {
  const message = (body as { message?: Record<string, unknown> })?.message;
  if (!message) return null;
  const chat = message.chat as
    | { id?: number | string; first_name?: string; last_name?: string; username?: string }
    | undefined;
  const text = message.text as string | undefined;
  if (!chat?.id || !text) return null;

  const name =
    [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim() ||
    chat.username ||
    String(chat.id);
  return { channel: "tg", contactHandle: String(chat.id), contactName: name, text };
}
