const RAW_API_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Backend base URL, resolved from VITE_API_URL (inlined at build time):
 * - ""            → demo mode (empty adapters, no auth).
 * - "same-origin" → the same host that serves the app. Used by the single-service
 *   deploy (e.g. Render), where the API serves the built SPA — no CORS, cookies
 *   stay first-party.
 * - "host.tld"    → a bare host gets https:// prepended.
 * - full URL      → used as-is.
 */
export const API_URL =
  RAW_API_URL === "same-origin"
    ? typeof window !== "undefined"
      ? window.location.origin
      : ""
    : RAW_API_URL && !/^https?:\/\//i.test(RAW_API_URL)
      ? `https://${RAW_API_URL}`
      : RAW_API_URL;

/** Whether a real backend is configured (auth + live data enabled). */
export function isBackendConfigured(): boolean {
  return API_URL.length > 0;
}
