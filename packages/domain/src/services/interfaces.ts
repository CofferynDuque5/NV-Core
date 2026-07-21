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

export interface CampaignService {
  list(workspaceId: string): Promise<ListResult<Campaign>>;
  get(workspaceId: string, id: string): Promise<Campaign | null>;
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
}

export interface GroupService {
  list(workspaceId: string): Promise<ListResult<Group>>;
}

export interface SegmentService {
  list(workspaceId: string): Promise<ListResult<Segment>>;
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
}

export interface AutomationService {
  list(workspaceId: string): Promise<ListResult<Automation>>;
}

export interface AnalyticsService {
  snapshot(workspaceId: string): Promise<AnalyticsSnapshot | null>;
}

export interface ConnectionService {
  list(workspaceId: string): Promise<Connection[]>;
  get(workspaceId: string, id: string): Promise<Connection | null>;
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
