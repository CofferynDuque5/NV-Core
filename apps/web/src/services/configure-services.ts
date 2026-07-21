import { configureServices } from "@nv/domain";

import { createHttpAdapters } from "./http-adapters";

/**
 * Wires the service registry.
 *
 * - No `NEXT_PUBLIC_API_URL` → keep the empty adapters (default): skeletons and
 *   empty states, zero network. This is phase-1 behavior.
 * - `NEXT_PUBLIC_API_URL` set → point the whole app at the NestJS backend
 *   (@nv/api). No component changes; every data hook now hits the API.
 */
let done = false;

export function initServices(): void {
  if (done) return;
  done = true;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    configureServices(createHttpAdapters(apiUrl));
  }
}
