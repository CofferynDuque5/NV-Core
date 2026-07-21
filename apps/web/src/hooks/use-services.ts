"use client";

import { getServices, type Services } from "@nv/domain";

/**
 * Access the service registry. Today this returns the empty adapters; when the
 * backend lands, `configureServices(httpAdapters)` swaps them and this hook is
 * unchanged.
 */
export function useServices(): Services {
  return getServices();
}
