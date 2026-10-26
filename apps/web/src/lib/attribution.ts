import type { AttributionInput, LeadAttribution } from "@nv/domain";

/**
 * Reads the visit's origin from the public page URL. When the form runs inside
 * the embed iframe, the host page passes its own URL and referrer as
 * `nv_page` / `nv_ref` (plus its utm_* params), since an iframe can't read them.
 */
export function readAttribution(href: string, documentReferrer: string, funnelId?: string): AttributionInput {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return funnelId ? { funnelId } : {};
  }
  const p = url.searchParams;
  const get = (k: string) => p.get(k)?.trim() || undefined;
  const embedded = get("nv_page");
  const out: AttributionInput = {
    utmSource: get("utm_source"),
    utmMedium: get("utm_medium"),
    utmCampaign: get("utm_campaign"),
    utmContent: get("utm_content"),
    utmTerm: get("utm_term"),
    landingUrl: embedded ?? `${url.origin}${url.pathname}`,
    referrer: embedded ? get("nv_ref") : documentReferrer || undefined,
    funnelId,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as AttributionInput;
}

/** "instagram · paid · kit-oct" — the short origin line for a contact. */
export function attributionLine(a: LeadAttribution): string {
  return [a.source, a.medium, a.campaign].filter(Boolean).join(" · ");
}

/** Label for an analytics lead-source row. */
export function leadSourceLabel(source: string | null): string {
  if (source === null) return "Sin origen (manual, importación o chat)";
  if (source === "directo") return "Directo (sin UTM ni referente)";
  if (source === "otros") return "Otros orígenes";
  return source;
}
