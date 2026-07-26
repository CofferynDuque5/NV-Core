import type { AppConfig } from "../../config/configuration";

/**
 * Resolve the target webhook URL: an absolute URL is used as-is, otherwise the
 * value is treated as a path joined onto the n8n base URL. Pure — unit tested.
 */
export function resolveWebhookUrl(baseUrl: string | undefined, target: string): string | null {
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!baseUrl) return null;
  const base = baseUrl.replace(/\/$/, "");
  const path = trimmed.replace(/^\//, "");
  return `${base}/${path}`;
}

export interface N8nTriggerResult {
  ok: boolean;
  status: number;
}

/**
 * POST a JSON payload to an n8n webhook. Sends the API key header when set
 * (harmless for public webhooks, required for authenticated ones).
 */
export async function triggerWebhook(
  n8n: AppConfig["integrations"]["n8n"],
  target: string,
  payload: unknown,
): Promise<N8nTriggerResult> {
  const url = resolveWebhookUrl(n8n.baseUrl, target);
  if (!url) throw new Error("URL de webhook inválida y sin N8N_BASE_URL configurado.");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(n8n.apiKey ? { "X-N8N-API-KEY": n8n.apiKey } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`n8n respondió ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return { ok: true, status: res.status };
}
