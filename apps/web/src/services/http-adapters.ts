import type {
  AnalyticsSnapshot,
  Automation,
  Campaign,
  CalendarEvent,
  Connection,
  Contact,
  Conversation,
  Group,
  Integration,
  ListResult,
  MediaAsset,
  MediaFolder,
  Message,
  Notification,
  Post,
  RoleDefinition,
  Segment,
  Services,
  Template,
  TeamMember,
  AuditLogEntry,
} from "@nv/domain";

/**
 * HTTP adapters — implement the shared `Services` contract against the NestJS
 * API (@nv/api). Enabled only when NEXT_PUBLIC_API_URL is set (see
 * ./configure-services). Response shapes match the backend 1:1.
 */
export interface HttpAdapterOptions {
  baseUrl: string;
  /** Supplies the current JWT (or null) for each request. */
  getToken?: () => string | null;
  /** Invoked once on a 401 so the app can clear session + redirect. */
  onUnauthorized?: () => void;
}

function createClient(opts: HttpAdapterOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  function authHeaders(): Record<string, string> {
    const token = opts.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function handle<T>(res: Response, path: string): Promise<T> {
    if (res.status === 401) {
      opts.onUnauthorized?.();
      throw new Error(`API 401 on ${path}`);
    }
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${base}/api${path}`, {
      headers: { Accept: "application/json", ...authHeaders() },
    });
    return handle<T>(res, `GET ${path}`);
  }

  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handle<T>(res, `${method} ${path}`);
  }

  const post = <T>(path: string, body: unknown) => send<T>("POST", path, body);
  const patch = <T>(path: string, body: unknown) => send<T>("PATCH", path, body);
  const del = <T>(path: string) => send<T>("DELETE", path);

  return { get, post, patch, del };
}

export function createHttpAdapters(opts: HttpAdapterOptions): Services {
  const { get, post, patch, del } = createClient(opts);
  const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

  return {
    campaigns: {
      list: (id) => get<ListResult<Campaign>>(`${ws(id)}/campaigns`),
      get: (id, cid) => get<Campaign | null>(`${ws(id)}/campaigns/${cid}`),
      create: (id, input) => post<Campaign>(`${ws(id)}/campaigns`, input),
      update: (id, cid, input) => patch<Campaign>(`${ws(id)}/campaigns/${cid}`, input),
      remove: (id, cid) => del<void>(`${ws(id)}/campaigns/${cid}`),
    },
    posts: {
      list: (id) => get<ListResult<Post>>(`${ws(id)}/posts`),
      today: (id) => get<Post[]>(`${ws(id)}/posts/today`),
    },
    calendar: {
      events: (id, month) => get<CalendarEvent[]>(`${ws(id)}/calendar/events?month=${month}`),
    },
    contacts: {
      list: (id) => get<ListResult<Contact>>(`${ws(id)}/contacts`),
      create: (id, input) => post<Contact>(`${ws(id)}/contacts`, input),
      update: (id, cid, input) => patch<Contact>(`${ws(id)}/contacts/${cid}`, input),
      remove: (id, cid) => del<void>(`${ws(id)}/contacts/${cid}`),
    },
    groups: {
      list: (id) => get<ListResult<Group>>(`${ws(id)}/groups`),
      create: (id, input) => post<Group>(`${ws(id)}/groups`, input),
      remove: (id, gid) => del<void>(`${ws(id)}/groups/${gid}`),
    },
    segments: {
      list: (id) => get<ListResult<Segment>>(`${ws(id)}/segments`),
      create: (id, input) => post<Segment>(`${ws(id)}/segments`, input),
      remove: (id, sid) => del<void>(`${ws(id)}/segments/${sid}`),
    },
    inbox: {
      conversations: (id) => get<ListResult<Conversation>>(`${ws(id)}/inbox/conversations`),
      messages: (id, cid) => get<Message[]>(`${ws(id)}/inbox/conversations/${cid}/messages`),
    },
    media: {
      folders: (id) => get<MediaFolder[]>(`${ws(id)}/media/folders`),
      assets: (id, folderId) =>
        get<ListResult<MediaAsset>>(
          `${ws(id)}/media/assets${folderId ? `?folderId=${folderId}` : ""}`,
        ),
    },
    templates: {
      list: (id) => get<ListResult<Template>>(`${ws(id)}/templates`),
      create: (id, input) => post<Template>(`${ws(id)}/templates`, input),
      remove: (id, tid) => del<void>(`${ws(id)}/templates/${tid}`),
    },
    automations: {
      list: (id) => get<ListResult<Automation>>(`${ws(id)}/automations`),
      create: (id, input) => post<Automation>(`${ws(id)}/automations`, input),
      remove: (id, aid) => del<void>(`${ws(id)}/automations/${aid}`),
    },
    analytics: { snapshot: (id) => get<AnalyticsSnapshot | null>(`${ws(id)}/analytics`) },
    connections: {
      list: (id) => get<Connection[]>(`${ws(id)}/connections`),
      get: (id, cid) => get<Connection | null>(`${ws(id)}/connections/${cid}`),
      upsert: (id, input) => post<Connection>(`${ws(id)}/connections`, input),
      remove: (id, cid) => del<void>(`${ws(id)}/connections/${cid}`),
    },
    integrations: { catalog: (id) => get<Integration[]>(`${ws(id)}/integrations`) },
    notifications: {
      list: (id) => get<Notification[]>(`${ws(id)}/notifications`),
      unreadCount: (id) =>
        get<{ count: number }>(`${ws(id)}/notifications/unread-count`).then((r) => r.count),
    },
    team: {
      members: (id) => get<TeamMember[]>(`${ws(id)}/team/members`),
      roles: (id) => get<RoleDefinition[]>(`${ws(id)}/team/roles`),
      addMember: (id, input) => post<void>(`${ws(id)}/members`, input),
      removeMember: (id, userId) => del<void>(`${ws(id)}/members/${userId}`),
    },
    audit: { logs: (id) => get<AuditLogEntry[]>(`${ws(id)}/audit/logs`) },
    ai: {
      // Action endpoints require a provider (return 501 until configured).
      generateVariants: (input) =>
        post<{ tag: string; text: string }[]>(
          `/workspaces/${encodeURIComponent("__current__")}/ai/variants`,
          input,
        ),
      suggestHashtags: async () => [],
    },
    messaging: {
      send: (input) =>
        post<{ id: string }>(
          `/workspaces/${encodeURIComponent("__current__")}/messaging/send`,
          input,
        ),
    },
    billing: {
      portalUrl: (id) => get<{ url: string | null }>(`${ws(id)}/billing/portal`).then((r) => r.url),
    },
  };
}
