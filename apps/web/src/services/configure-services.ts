import { configureServices } from "@nv/domain";

import { API_URL, isBackendConfigured } from "@/lib/env";
import { useAuthStore } from "@/stores/auth-store";
import { createHttpAdapters } from "./http-adapters";

/**
 * Wires the service registry.
 *
 * - No `NEXT_PUBLIC_API_URL` → keep the empty adapters (demo mode): skeletons,
 *   empty states, zero network, no auth.
 * - `NEXT_PUBLIC_API_URL` set → point the app at the NestJS backend. Requests
 *   carry the in-memory access token; a 401 triggers a single deduped refresh
 *   (via the httpOnly cookie) and retry. If refresh fails, the session is
 *   cleared and the auth gate redirects to /login.
 */
let done = false;

// Dedupe concurrent refreshes: many 401s share one refresh call.
let refreshing: Promise<string | null> | null = null;

export function initServices(): void {
  if (done) return;
  done = true;

  if (!isBackendConfigured()) return;

  configureServices(
    createHttpAdapters({
      baseUrl: API_URL,
      getToken: () => useAuthStore.getState().token,
      refresh: () => {
        if (!refreshing) {
          refreshing = useAuthStore
            .getState()
            .refreshSession()
            .catch(() => null)
            .finally(() => {
              refreshing = null;
            });
        }
        return refreshing;
      },
      onUnauthorized: () => useAuthStore.getState().logout(),
    }),
  );
}
