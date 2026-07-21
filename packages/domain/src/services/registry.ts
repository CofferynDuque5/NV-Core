import { emptyAdapters } from "./empty-adapters";
import type { Services } from "./interfaces";

/**
 * Service registry (simple dependency injection).
 *
 * The UI resolves services through here instead of importing an
 * implementation directly. Phase 2 calls `configureServices(httpAdapters)`
 * once at bootstrap and nothing else in the app changes.
 */
let current: Services = emptyAdapters;

export function configureServices(services: Services): void {
  current = services;
}

export function getServices(): Services {
  return current;
}
