import { configureServices } from "@nv/domain";

import { API_URL, isBackendConfigured } from "@/lib/env";
import { getStoredToken } from "@/lib/auth-storage";
import { useAuthStore } from "@/stores/auth-store";
import { createHttpAdapters } from "./http-adapters";

/**
 * Wires the service registry.
 *
 * - No `NEXT_PUBLIC_API_URL` → keep the empty adapters (default): skeletons and
 *   empty states, zero network, no auth. This is demo/phase-1 behavior.
 * - `NEXT_PUBLIC_API_URL` set → point the app at the NestJS backend. Every
 *   request carries the stored JWT; a 401 clears the session so the auth gate
 *   sends the user back to /login.
 */
let done = false;

export function initServices(): void {
  if (done) return;
  done = true;

  if (isBackendConfigured()) {
    configureServices(
      createHttpAdapters({
        baseUrl: API_URL,
        getToken: () => getStoredToken(),
        onUnauthorized: () => useAuthStore.getState().logout(),
      }),
    );
  }
}
