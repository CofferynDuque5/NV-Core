import type { Affiliate } from "@nv/domain";

/** Pure helpers for the affiliate program UI. */

/** The public referral link for a code (served by the API's /r/:code redirect). */
export function referralLink(apiBase: string, code: string): string {
  const base = apiBase.replace(/\/$/, "");
  // The backend mounts routes under /api; /r/:code counts the click + redirects.
  return `${base}/api/r/${code}`;
}

/** Click → conversion rate as a 0–100 number, 0 when no clicks. */
export function conversionRate(a: Pick<Affiliate, "clicks" | "conversions">): number {
  if (a.clicks <= 0) return 0;
  return Math.round((a.conversions / a.clicks) * 1000) / 10;
}

/** Format a money amount for display (no currency assumptions). */
export function money(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
