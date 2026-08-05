import type { AppConfig } from "../../config/configuration";

/**
 * Low-level HTTP transport for the official WhatsApp Cloud API and Telegram Bot
 * API. These are pure functions (no NestJS, no DI) consumed only by the
 * corresponding provider adapters — they are the single place that touches
 * those external HTTP endpoints.
 */

export interface OutboundMessage {
  channel: string;
  to: string;
  body: string;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`;
}

export async function sendWhatsApp(
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
