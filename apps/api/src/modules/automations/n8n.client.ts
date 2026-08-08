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

/**
 * True when a hostname points at a private, loopback, link-local, or
 * cloud-metadata target. Used to block SSRF via user-supplied absolute webhook
 * URLs. Literal-host check (no DNS resolution). Pure — unit tested.
 */
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata" || h === "metadata.google.internal") return true;
  // IPv6 loopback / unique-local (fc00::/7) / link-local (fe80::/10) / unspecified
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 0 || a === 10) return true; // loopback / this-host / private-A
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private-B
    if (a === 192 && b === 168) return true; // private-C
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

/** Same protocol+host as the configured n8n base (the trusted instance). */
function isTrustedBase(url: string, baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    const u = new URL(url);
    const b = new URL(baseUrl);
    return u.protocol === b.protocol && u.host === b.host;
  } catch {
    return false;
  }
}

/**
 * Reject a webhook target that would be an SSRF: bad scheme or a private/
 * internal host. Throws on rejection. Trusted (== configured n8n base) hosts
 * are allowed by the caller before this runs, since a self-hosted n8n may be
 * internal by design.
 */
export function assertPublicWebhookUrl(rawUrl: string): void {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("URL de webhook inválida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("El webhook debe usar http(s).");
  }
  if (isPrivateHostname(u.hostname)) {
    throw new Error("El webhook apunta a un host interno/privado no permitido.");
  }
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
  // The configured n8n instance is trusted (may be internal by design); any
  // OTHER absolute URL is user-supplied and must not point at a private host
  // (SSRF). The API key is only ever sent to the trusted n8n instance.
  const trusted = isTrustedBase(url, n8n.baseUrl);
  if (!trusted) assertPublicWebhookUrl(url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(trusted && n8n.apiKey ? { "X-N8N-API-KEY": n8n.apiKey } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`n8n respondió ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return { ok: true, status: res.status };
}
