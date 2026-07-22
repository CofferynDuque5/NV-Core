import type { ListResult, Services } from "./interfaces";

/**
 * Empty adapters — Phase 1.
 *
 * Every method resolves to an empty result after a short simulated latency so
 * the UI can exercise its skeleton → empty-state flow honestly. No data is
 * invented. When the backend lands, replace this with an HTTP adapter that
 * fulfills the same `Services` contract.
 */

const LATENCY_MS = 450;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function emptyList<T>(): Promise<ListResult<T>> {
  return delay({ items: [], total: 0 });
}

/** Mutations are unavailable without a backend (demo mode). */
function notAvailable(): never {
  throw new Error("Acción no disponible en modo demo. Configura el backend (NEXT_PUBLIC_API_URL).");
}

export const emptyAdapters: Services = {
  campaigns: {
    list: () => emptyList(),
    get: () => delay(null),
    create: () => notAvailable(),
    update: () => notAvailable(),
    remove: () => notAvailable(),
  },
  posts: {
    list: () => emptyList(),
    today: () => delay([]),
  },
  calendar: {
    events: () => delay([]),
  },
  contacts: {
    list: () => emptyList(),
    create: () => notAvailable(),
    update: () => notAvailable(),
    remove: () => notAvailable(),
  },
  groups: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
  },
  segments: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
  },
  inbox: {
    conversations: () => emptyList(),
    messages: () => delay([]),
  },
  media: {
    folders: () => delay([]),
    assets: () => emptyList(),
  },
  templates: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
  },
  automations: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
  },
  analytics: {
    snapshot: () => delay(null),
  },
  connections: {
    list: () => delay([]),
    get: () => delay(null),
    upsert: () => notAvailable(),
    remove: () => notAvailable(),
  },
  integrations: {
    catalog: () => delay([]),
  },
  notifications: {
    list: () => delay([]),
    unreadCount: () => delay(0),
  },
  team: {
    members: () => delay([]),
    roles: () => delay([]),
    addMember: () => notAvailable(),
    removeMember: () => notAvailable(),
  },
  audit: {
    logs: () => delay([]),
  },
  ai: {
    generateVariants: () => delay([]),
    suggestHashtags: () => delay([]),
  },
  messaging: {
    send: () => {
      throw new Error("MessagingService is not implemented yet (phase 2).");
    },
  },
  billing: {
    portalUrl: () => delay(null),
  },
};
