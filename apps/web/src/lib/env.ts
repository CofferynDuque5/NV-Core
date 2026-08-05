/** Backend base URL. When unset, the app runs in demo mode (empty adapters). */
export const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Whether a real backend is configured (auth + live data enabled). */
export function isBackendConfigured(): boolean {
  return API_URL.length > 0;
}
