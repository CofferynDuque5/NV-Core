declare global {
  interface Window {
    /** Runtime config injected by /config.js (editable after the build). */
    __NV_CONFIG__?: { apiUrl?: string };
  }
}

/** Runtime override from /config.js wins over the build-time VITE_API_URL. */
const runtimeApiUrl =
  typeof window !== "undefined" ? (window.__NV_CONFIG__?.apiUrl ?? "").trim() : "";
const RAW_API_URL = runtimeApiUrl || (import.meta.env.VITE_API_URL ?? "");

/**
 * Backend base URL, resolved from /config.js (runtime) or VITE_API_URL (build):
 * - ""            → demo mode (empty adapters, no auth).
 * - "same-origin" → the same host that serves the app (single-service deploy);
 *   no CORS, cookies stay first-party.
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
