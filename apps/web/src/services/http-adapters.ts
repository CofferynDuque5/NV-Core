import type {
  AiRecommendationsResult,
  AiUsage,
  AnalyticsSnapshot,
  Automation,
  BillingStatus,
  Campaign,
  CalendarEvent,
  Connection,
  Contact,
  Conversation,
  GoogleStatus,
  Group,
  Integration,
  ListResult,
  MediaAsset,
  MediaFolder,
  MediaUploadSignature,
  Message,
  Notification,
  Post,
  RoleDefinition,
  Segment,
  SendLogEntry,
  Services,
  SocialInsights,
  SocialResult,
  SocialStatus,
  Template,
  TeamMember,
  AuditLogEntry,
  Workspace,
  WhatsappStatus,
} from "@nv/domain";

/**
 * HTTP adapters — implement the shared `Services` contract against the NestJS
 * API (@nv/api). Enabled only when VITE_API_URL is set (see
 * ./configure-services). Response shapes match the backend 1:1.
 */
export interface HttpAdapterOptions {
  baseUrl: string;
  /** Supplies the current access token (or null) for each request. */
  getToken?: () => string | null;
  /** Tries to renew the session; returns a fresh token or null. */
  refresh?: () => Promise<string | null>;
  /** Invoked when the session can't be renewed (clear session + redirect). */
  onUnauthorized?: () => void;
}

function createClient(opts: HttpAdapterOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  function authHeaders(): Record<string, string> {
    const token = opts.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function raw(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${base}/api${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async function parse<T>(res: Response, path: string): Promise<T> {
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Runs a request; on 401 tries a single refresh + retry, else signs out. */
  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res = await raw(method, path, body);
    if (res.status === 401 && opts.refresh) {
      const token = await opts.refresh();
      if (token) res = await raw(method, path, body);
    }
    if (res.status === 401) {
      opts.onUnauthorized?.();
      throw new Error(`API 401 on ${method} ${path}`);
    }
    return parse<T>(res, `${method} ${path}`);
  }

  const get = <T>(path: string) => send<T>("GET", path);
  const post = <T>(path: string, body: unknown) => send<T>("POST", path, body);
  const patch = <T>(path: string, body: unknown) => send<T>("PATCH", path, body);
  const put = <T>(path: string, body: unknown) => send<T>("PUT", path, body);
  const del = <T>(path: string) => send<T>("DELETE", path);

  return { get, post, patch, put, del };
}

export function createHttpAdapters(opts: HttpAdapterOptions): Services {
  const { get, post, patch, put, del } = createClient(opts);
  const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

  return {
    workspaces: {
      list: () => get<Workspace[]>(`/workspaces`),
      create: (input) => post<Workspace>(`/workspaces`, input),
    },
    whatsapp: {
      status: (id) => get<WhatsappStatus>(`${ws(id)}/whatsapp/status`),
      connect: (id) => post<WhatsappStatus>(`${ws(id)}/whatsapp/connect`, {}),
      reconnect: (id) => post<WhatsappStatus>(`${ws(id)}/whatsapp/reconnect`, {}),
      disconnect: (id) => post<WhatsappStatus>(`${ws(id)}/whatsapp/disconnect`, {}),
      sync: (id) => post<WhatsappStatus>(`${ws(id)}/whatsapp/sync`, {}),
    },
    campaigns: {
      list: (id) => get<ListResult<Campaign>>(`${ws(id)}/campaigns`),
      get: (id, cid) => get<Campaign | null>(`${ws(id)}/campaigns/${cid}`),
      create: (id, input) => post<Campaign>(`${ws(id)}/campaigns`, input),
      update: (id, cid, input) => patch<Campaign>(`${ws(id)}/campaigns/${cid}`, input),
      remove: (id, cid) => del<void>(`${ws(id)}/campaigns/${cid}`),
      run: (id, cid) => post<Campaign | null>(`${ws(id)}/campaigns/${cid}/run`, {}),
      pause: (id, cid) => post<Campaign>(`${ws(id)}/campaigns/${cid}/pause`, {}),
      resume: (id, cid) => post<Campaign>(`${ws(id)}/campaigns/${cid}/resume`, {}),
      logs: (id) => get<SendLogEntry[]>(`${ws(id)}/campaigns/logs`),
    },
    posts: {
      list: (id) => get<ListResult<Post>>(`${ws(id)}/posts`),
      today: (id) => get<Post[]>(`${ws(id)}/posts/today`),
      create: (id, input) => post<Post>(`${ws(id)}/posts`, input),
      update: (id, pid, input) => patch<Post>(`${ws(id)}/posts/${pid}`, input),
      duplicate: (id, pid, input) => post<Post>(`${ws(id)}/posts/${pid}/duplicate`, input),
      remove: (id, pid) => del<void>(`${ws(id)}/posts/${pid}`),
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
      getVars: (id, gid) => get<Record<string, string>>(`${ws(id)}/groups/${gid}/vars`),
      setVars: (id, gid, vars) => put<Record<string, string>>(`${ws(id)}/groups/${gid}/vars`, vars),
    },
    social: {
      status: (id) => get<SocialStatus>(`${ws(id)}/social/status`),
      publish: (id, input) => post<{ results: SocialResult[] }>(`${ws(id)}/social/publish`, input),
      insights: (id, target, mediaId) =>
        get<SocialInsights>(`${ws(id)}/social/insights?target=${target}&id=${encodeURIComponent(mediaId)}`),
    },
    segments: {
      list: (id) => get<ListResult<Segment>>(`${ws(id)}/segments`),
      create: (id, input) => post<Segment>(`${ws(id)}/segments`, input),
      remove: (id, sid) => del<void>(`${ws(id)}/segments/${sid}`),
    },
    inbox: {
      conversations: (id) => get<ListResult<Conversation>>(`${ws(id)}/inbox/conversations`),
      messages: (id, cid) => get<Message[]>(`${ws(id)}/inbox/conversations/${cid}/messages`),
      createConversation: (id, input) =>
        post<Conversation>(`${ws(id)}/inbox/conversations`, input),
      sendMessage: (id, cid, input) =>
        post<Message>(`${ws(id)}/inbox/conversations/${cid}/messages`, input),
      setResolved: (id, cid, resolved) =>
        patch<Conversation>(`${ws(id)}/inbox/conversations/${cid}`, { resolved }),
    },
    media: {
      folders: (id) => get<MediaFolder[]>(`${ws(id)}/media/folders`),
      assets: (id, query) => {
        const params = new URLSearchParams();
        if (query?.folderId) params.set("folderId", query.folderId);
        if (query?.q) params.set("q", query.q);
        if (query?.tag) params.set("tag", query.tag);
        const qs = params.toString();
        return get<ListResult<MediaAsset>>(`${ws(id)}/media/assets${qs ? `?${qs}` : ""}`);
      },
      tags: (id) => get<string[]>(`${ws(id)}/media/tags`),
      uploadSignature: (id, folder) =>
        get<MediaUploadSignature | null>(
          `${ws(id)}/media/upload-signature${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`,
        ),
      createAsset: (id, input) => post<MediaAsset>(`${ws(id)}/media/assets`, input),
      updateAsset: (id, assetId, input) => patch<MediaAsset>(`${ws(id)}/media/assets/${assetId}`, input),
      removeAsset: (id, assetId) => del<void>(`${ws(id)}/media/assets/${assetId}`),
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
      run: (id, aid) =>
        post<{ triggered: boolean; runs: number }>(`${ws(id)}/automations/${aid}/run`, {}),
    },
    analytics: {
      snapshot: (id, days) =>
        get<AnalyticsSnapshot | null>(`${ws(id)}/analytics${days ? `?days=${days}` : ""}`),
    },
    connections: {
      list: (id) => get<Connection[]>(`${ws(id)}/connections`),
      get: (id, cid) => get<Connection | null>(`${ws(id)}/connections/${cid}`),
      upsert: (id, input) => post<Connection>(`${ws(id)}/connections`, input),
      remove: (id, cid) => del<void>(`${ws(id)}/connections/${cid}`),
    },
    integrations: {
      catalog: (id) => get<Integration[]>(`${ws(id)}/integrations`),
      googleStatus: (id) => get<GoogleStatus>(`${ws(id)}/integrations/google/status`),
      googleAuthUrl: (id) =>
        get<{ url: string }>(`${ws(id)}/integrations/google/auth-url`).then((r) => r.url),
      googleDisconnect: (id) => del<void>(`${ws(id)}/integrations/google`),
    },
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
      // Action endpoints require a provider (return 503 until configured).
      generateVariants: (id, input) =>
        post<{ tag: string; text: string }[]>(`${ws(id)}/ai/variants`, input),
      suggestHashtags: (id, input) =>
        post<{ hashtags: string[] }>(`${ws(id)}/ai/hashtags`, input).then((r) => r.hashtags),
      usage: (id) => get<AiUsage>(`${ws(id)}/ai/usage`),
      improve: (id, input) => post<{ text: string }>(`${ws(id)}/ai/improve`, input),
      recommendations: (id) => get<AiRecommendationsResult>(`${ws(id)}/ai/recommendations`),
    },
    messaging: {
      send: (id, input) => post<{ id: string }>(`${ws(id)}/messaging/send`, input),
    },
    billing: {
      status: (id) => get<BillingStatus>(`${ws(id)}/billing/status`),
      checkout: (id, input) => post<{ url: string }>(`${ws(id)}/billing/checkout`, input),
      portalUrl: (id, returnUrl) =>
        post<{ url: string | null }>(`${ws(id)}/billing/portal`, { returnUrl }).then((r) => r.url),
    },
  };
}
