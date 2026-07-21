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

export const emptyAdapters: Services = {
  campaigns: {
    list: () => emptyList(),
    get: () => delay(null),
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
  },
  groups: {
    list: () => emptyList(),
  },
  segments: {
    list: () => emptyList(),
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
  },
  automations: {
    list: () => emptyList(),
  },
  analytics: {
    snapshot: () => delay(null),
  },
  connections: {
    list: () => delay([]),
    get: () => delay(null),
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
