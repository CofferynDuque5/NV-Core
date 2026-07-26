import type { AppConfig } from "../../config/configuration";

/** Channels that support real outbound delivery through a messaging provider. */
export const MESSAGING_CHANNELS = ["wa", "tg"] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

export function isMessagingChannel(channel: string): channel is MessagingChannel {
  return (MESSAGING_CHANNELS as readonly string[]).includes(channel);
}

/** Whether the given channel has a fully-configured provider (pure — testable). */
export function isChannelConfigured(
  integrations: AppConfig["integrations"],
  channel: string,
): boolean {
  switch (channel) {
    case "wa":
      return Boolean(integrations.whatsapp.token && integrations.whatsapp.phoneNumberId);
    case "tg":
      return Boolean(integrations.telegram.botToken);
    default:
      return false;
  }
}

export interface OutboundMessage {
  channel: string;
  to: string;
  body: string;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`;
}

async function sendWhatsApp(
  wa: AppConfig["integrations"]["whatsapp"],
  msg: OutboundMessage,
): Promise<{ id: string }> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(wa.phoneNumberId!)}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${wa.token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to,
        type: "text",
        text: { body: msg.body },
      }),
    },
  );
  if (!res.ok) throw new Error(`WhatsApp: ${await readError(res)}`);
  const data = (await res.json()) as { messages?: { id?: string }[] };
  return { id: data.messages?.[0]?.id ?? "" };
}

async function sendTelegram(
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

/**
 * Deliver a message through the channel's provider. Throws when the channel is
 * unsupported or unconfigured — callers map that to a 503.
 */
export async function deliverMessage(
  integrations: AppConfig["integrations"],
  msg: OutboundMessage,
): Promise<{ id: string }> {
  if (!isChannelConfigured(integrations, msg.channel)) {
    throw new Error(`Canal "${msg.channel}" no soportado o sin proveedor configurado.`);
  }
  if (msg.channel === "wa") return sendWhatsApp(integrations.whatsapp, msg);
  return sendTelegram(integrations.telegram, msg);
}
