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
  MediaAsset,
  MediaFolder,
  Message,
  Notification,
  Post,
  RoleDefinition,
  Segment,
  Template,
  TeamMember,
  AuditLogEntry,
} from "../entities";

/**
 * Service contracts.
 *
 * These interfaces are the boundary between the UI and any future backend.
 * Phase 1 ships `emptyAdapters` (return nothing → empty states). Phase 2
 * swaps in HTTP adapters that call the NestJS API. The UI never changes.
 *
 * Every read is scoped by `workspaceId` to enforce multi-tenancy from day one.
 */

export interface ListResult<T> {
  items: T[];
  total: number;
}

// ── Mutation inputs ─────────────────────────────────────────────────────────

export interface CreateContactInput {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  tags?: string[];
  stage?: Contact["stage"];
}
export type UpdateContactInput = Partial<CreateContactInput>;

export interface CreateCampaignInput {
  name: string;
  status?: Campaign["status"];
  channels?: Campaign["channels"];
  progress?: number;
  nextRunAt?: string;
  accent?: string;
}

export interface CreateSegmentInput {
  name: string;
  color?: string;
  rules?: Segment["rules"];
}

export interface CreateGroupInput {
  name: string;
  channel?: Group["channel"];
  description?: string;
  tags?: string[];
  members?: number;
}

export interface CreateTemplateInput {
  name: string;
  body: string;
  category?: string;
}

export interface UpsertConnectionInput {
  channel: Connection["channel"];
  handle: string;
  status?: Connection["status"];
  token?: string;
  expiresAt?: string;
  webhookStatus?: string;
  permissions?: string[];
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  status?: Automation["status"];
  nodes?: Automation["nodes"];
}

export interface CampaignService {
  list(workspaceId: string): Promise<ListResult<Campaign>>;
  get(workspaceId: string, id: string): Promise<Campaign | null>;
  create(workspaceId: string, input: CreateCampaignInput): Promise<Campaign>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface PostService {
  list(workspaceId: string): Promise<ListResult<Post>>;
  today(workspaceId: string): Promise<Post[]>;
}

export interface CalendarService {
  events(workspaceId: string, month: string): Promise<CalendarEvent[]>;
}

export interface ContactService {
  list(workspaceId: string): Promise<ListResult<Contact>>;
  create(workspaceId: string, input: CreateContactInput): Promise<Contact>;
  update(workspaceId: string, id: string, input: UpdateContactInput): Promise<Contact>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface GroupService {
  list(workspaceId: string): Promise<ListResult<Group>>;
  create(workspaceId: string, input: CreateGroupInput): Promise<Group>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface SegmentService {
  list(workspaceId: string): Promise<ListResult<Segment>>;
  create(workspaceId: string, input: CreateSegmentInput): Promise<Segment>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface InboxService {
  conversations(workspaceId: string): Promise<ListResult<Conversation>>;
  messages(workspaceId: string, conversationId: string): Promise<Message[]>;
}

export interface MediaService {
  folders(workspaceId: string): Promise<MediaFolder[]>;
  assets(workspaceId: string, folderId?: string): Promise<ListResult<MediaAsset>>;
}

export interface TemplateService {
  list(workspaceId: string): Promise<ListResult<Template>>;
  create(workspaceId: string, input: CreateTemplateInput): Promise<Template>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface AutomationService {
  list(workspaceId: string): Promise<ListResult<Automation>>;
  create(workspaceId: string, input: CreateAutomationInput): Promise<Automation>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface AnalyticsService {
  snapshot(workspaceId: string): Promise<AnalyticsSnapshot | null>;
}

export interface ConnectionService {
  list(workspaceId: string): Promise<Connection[]>;
  get(workspaceId: string, id: string): Promise<Connection | null>;
  upsert(workspaceId: string, input: UpsertConnectionInput): Promise<Connection>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface IntegrationService {
  catalog(workspaceId: string): Promise<Integration[]>;
}

export interface NotificationService {
  list(workspaceId: string): Promise<Notification[]>;
  unreadCount(workspaceId: string): Promise<number>;
}

export interface TeamService {
  members(workspaceId: string): Promise<TeamMember[]>;
  roles(workspaceId: string): Promise<RoleDefinition[]>;
}

export interface AuditService {
  logs(workspaceId: string): Promise<AuditLogEntry[]>;
}

/**
 * Provider-facing contracts (external integrations). Phase 2 only — declared
 * so the UI and future NestJS modules agree on the shape ahead of time.
 */
export interface AiService {
  generateVariants(input: {
    prompt: string;
    channel: string;
    tone: string;
  }): Promise<{ tag: string; text: string }[]>;
  suggestHashtags(input: { prompt: string }): Promise<string[]>;
}

export interface MessagingService {
  send(input: { channel: string; to: string; body: string }): Promise<{ id: string }>;
}

export interface BillingService {
  portalUrl(workspaceId: string): Promise<string | null>;
}

/** All services the UI can resolve. */
export interface Services {
  campaigns: CampaignService;
  posts: PostService;
  calendar: CalendarService;
  contacts: ContactService;
  groups: GroupService;
  segments: SegmentService;
  inbox: InboxService;
  media: MediaService;
  templates: TemplateService;
  automations: AutomationService;
  analytics: AnalyticsService;
  connections: ConnectionService;
  integrations: IntegrationService;
  notifications: NotificationService;
  team: TeamService;
  audit: AuditService;
  ai: AiService;
  messaging: MessagingService;
  billing: BillingService;
}
