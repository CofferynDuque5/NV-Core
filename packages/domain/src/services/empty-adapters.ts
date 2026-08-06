import { WORKSPACES } from "../config/workspaces";
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
  throw new Error("Acción no disponible en modo demo. Configura el backend (VITE_API_URL).");
}

export const emptyAdapters: Services = {
  workspaces: {
    list: () => delay([...WORKSPACES]),
    create: () => notAvailable(),
  },
  whatsapp: {
    status: () =>
      delay({
        status: "disconnected",
        provider: "baileys",
        number: null,
        lastConnectionAt: null,
        groupsCount: 0,
        contactsCount: 0,
      }),
    connect: () => notAvailable(),
    reconnect: () => notAvailable(),
    disconnect: () => notAvailable(),
    sync: () => notAvailable(),
  },
  campaigns: {
    list: () => emptyList(),
    get: () => delay(null),
    create: () => notAvailable(),
    update: () => notAvailable(),
    remove: () => notAvailable(),
    run: () => delay(null),
    pause: () => notAvailable(),
    resume: () => notAvailable(),
    logs: () => delay([]),
  },
  posts: {
    list: () => emptyList(),
    today: () => delay([]),
    create: () => notAvailable(),
    update: () => notAvailable(),
    duplicate: () => notAvailable(),
    remove: () => notAvailable(),
  },
  calendar: {
    events: () => delay([]),
  },
  contacts: {
    list: () => emptyList(),
    create: () => notAvailable(),
    update: () => notAvailable(),
    remove: () => notAvailable(),
    notes: () => delay([]),
    addNote: () => notAvailable(),
    removeNote: () => notAvailable(),
  },
  groups: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
    getVars: () => delay({}),
    setVars: () => notAvailable(),
  },
  social: {
    status: () => delay({ facebook: false, instagram: false }),
    publish: () => notAvailable(),
    insights: () => notAvailable(),
  },
  segments: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
  },
  inbox: {
    conversations: () => emptyList(),
    messages: () => delay([]),
    createConversation: () => notAvailable(),
    sendMessage: () => notAvailable(),
    setResolved: () => notAvailable(),
    updateConversation: () => notAvailable(),
  },
  media: {
    folders: () => delay([]),
    assets: () => emptyList(),
    tags: () => delay([]),
    uploadSignature: () => delay(null),
    createAsset: () => notAvailable(),
    updateAsset: () => notAvailable(),
    removeAsset: () => notAvailable(),
  },
  templates: {
    list: () => emptyList(),
    create: () => notAvailable(),
    remove: () => notAvailable(),
  },
  automations: {
    list: () => emptyList(),
    create: () => notAvailable(),
    update: () => notAvailable(),
    remove: () => notAvailable(),
    run: () => notAvailable(),
  },
  designs: {
    list: () => emptyList(),
    get: () => delay(null),
    create: () => notAvailable(),
    update: () => notAvailable(),
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
  marketplace: {
    catalog: () => delay([]),
    install: () => notAvailable(),
    uninstall: () => notAvailable(),
  },
  integrations: {
    catalog: () => delay([]),
    googleStatus: () => delay({ configured: false, connected: false, email: null }),
    googleAuthUrl: () => notAvailable(),
    googleDisconnect: () => notAvailable(),
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
    usage: () => delay({ period: "", calls: 0, tokens: 0, quota: null }),
    improve: () => notAvailable(),
    recommendations: () =>
      delay({
        recommendations: [],
        times: { sampleSize: 0, topDay: null, topHour: null, byDay: [] },
        aiConfigured: false,
      }),
  },
  messaging: {
    send: () => notAvailable(),
  },
  billing: {
    status: () =>
      delay({ configured: false, customer: false, subscriptionStatus: null, priceId: null }),
    checkout: () => notAvailable(),
    portalUrl: () => delay(null),
  },
};
