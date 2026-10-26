import type { AttributionInput, LeadAttribution } from "@nv/domain";

const TEXT_MAX = 120;
const URL_MAX = 300;

/** Trimmed, length-capped text; undefined when empty. */
function text(v: unknown, lower = false): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, TEXT_MAX);
  if (!t) return undefined;
  return lower ? t.toLowerCase() : t;
}

/**
 * Origin + path of an http(s) URL. The query string and fragment are dropped:
 * they can carry e-mails, tokens or click ids we have no reason to keep.
 */
export function cleanUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return `${u.origin}${u.pathname}`.slice(0, URL_MAX);
  } catch {
    return undefined;
  }
}

function host(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Normalises what a public page reported about the visit into the stored
 * first-touch record. Source falls back from utm_source to the referring
 * site's host (when it is not the page itself) to "directo".
 */
export function buildAttribution(
  input: AttributionInput | undefined,
  ctx: Pick<LeadAttribution, "via" | "formId" | "formName" | "funnelId" | "funnelName">,
  now = new Date(),
): LeadAttribution {
  const landingUrl = cleanUrl(input?.landingUrl);
  const referrer = cleanUrl(input?.referrer);
  const refHost = host(referrer);
  const external = refHost && refHost !== host(landingUrl) ? refHost : undefined;

  const utmSource = text(input?.utmSource, true);
  const source = utmSource ?? external ?? "directo";
  const medium = text(input?.utmMedium, true) ?? (!utmSource && external ? "referral" : undefined);

  const out: LeadAttribution = { source, via: ctx.via, capturedAt: now.toISOString() };
  const optional: Partial<LeadAttribution> = {
    medium,
    campaign: text(input?.utmCampaign),
    content: text(input?.utmContent),
    term: text(input?.utmTerm),
    landingUrl,
    referrer,
    formId: ctx.formId,
    formName: ctx.formName,
    funnelId: ctx.funnelId,
    funnelName: ctx.funnelName,
  };
  for (const [k, v] of Object.entries(optional)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}
