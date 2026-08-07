import type {
  AnalyticsSnapshot,
  Automation,
  Campaign,
  CalendarEvent,
  Connection,
  Contact,
  ContactNote,
  ContactImportResult,
  Conversation,
  Design,
  DesignFormat,
  DesignLayer,
  Group,
  Integration,
  MarketplaceEntry,
  MediaAsset,
  MediaFolder,
  Message,
  Notification,
  Post,
  RoleDefinition,
  Segment,
  SendLogEntry,
  Template,
  TeamMember,
  AuditLogEntry,
  Workspace,
} from "../entities";
import type { ContactStage, Role, WorkspaceKind } from "../enums";

/** Server-side query for the contacts list (search + stage + pagination). */
export interface ContactListQuery {
  /** Free-text search across name/company/email/phone/tags. */
  q?: string;
  stage?: ContactStage;
  page?: number;
  pageSize?: number;
}

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
  message?: string;
  scheduleType?: "once" | "daily" | "weekly";
  scheduleAt?: string;
  scheduleDays?: number[];
  attachments?: Campaign["attachments"];
  socialFormat?: string;
  targetGroups?: string[];
}
export type UpdateCampaignInput = Partial<CreateCampaignInput>;

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
  edges?: Automation["edges"];
  webhookUrl?: string;
}

/** Partial update of an automation's graph and metadata. */
export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  status?: Automation["status"];
  nodes?: Automation["nodes"];
  edges?: Automation["edges"];
  webhookUrl?: string;
}

export interface RunAutomationResult {
  triggered: boolean;
  runs: number;
}

export interface CreateDesignInput {
  name: string;
  format?: DesignFormat;
  layers?: DesignLayer[];
}

export interface UpdateDesignInput {
  name?: string;
  format?: DesignFormat;
  layers?: DesignLayer[];
}

export interface DesignService {
  list(workspaceId: string): Promise<ListResult<Design>>;
  get(workspaceId: string, id: string): Promise<Design | null>;
  create(workspaceId: string, input: CreateDesignInput): Promise<Design>;
  update(workspaceId: string, id: string, input: UpdateDesignInput): Promise<Design>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface CampaignService {
  list(workspaceId: string): Promise<ListResult<Campaign>>;
  get(workspaceId: string, id: string): Promise<Campaign | null>;
  create(workspaceId: string, input: CreateCampaignInput): Promise<Campaign>;
  update(workspaceId: string, id: string, input: UpdateCampaignInput): Promise<Campaign>;
  remove(workspaceId: string, id: string): Promise<void>;
  run(workspaceId: string, id: string): Promise<Campaign | null>;
  pause(workspaceId: string, id: string): Promise<Campaign>;
  resume(workspaceId: string, id: string): Promise<Campaign>;
  logs(workspaceId: string): Promise<SendLogEntry[]>;
}

export interface CreatePostInput {
  channel: Post["channel"];
  title: string;
  copy?: string;
  hashtags?: string[];
  status?: Post["status"];
  scheduledAt?: string;
  campaignId?: string;
}

/** Partial update — move (reschedule), edit or change status. */
export interface UpdatePostInput {
  channel?: Post["channel"];
  title?: string;
  copy?: string;
  hashtags?: string[];
  status?: Post["status"];
  /** ISO date, or null to unschedule. */
  scheduledAt?: string | null;
  campaignId?: string;
}

export interface DuplicatePostInput {
  /** ISO date for the copy; defaults to the source date. */
  scheduledAt?: string;
}

export interface PostService {
  list(workspaceId: string): Promise<ListResult<Post>>;
  today(workspaceId: string): Promise<Post[]>;
  create(workspaceId: string, input: CreatePostInput): Promise<Post>;
  update(workspaceId: string, id: string, input: UpdatePostInput): Promise<Post>;
  duplicate(workspaceId: string, id: string, input: DuplicatePostInput): Promise<Post>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface CalendarService {
  events(workspaceId: string, month: string): Promise<CalendarEvent[]>;
}

export interface ContactService {
  list(workspaceId: string, query?: ContactListQuery): Promise<ListResult<Contact>>;
  create(workspaceId: string, input: CreateContactInput): Promise<Contact>;
  update(workspaceId: string, id: string, input: UpdateContactInput): Promise<Contact>;
  remove(workspaceId: string, id: string): Promise<void>;
  notes(workspaceId: string, contactId: string): Promise<ContactNote[]>;
  addNote(workspaceId: string, contactId: string, body: string): Promise<ContactNote>;
  removeNote(workspaceId: string, contactId: string, noteId: string): Promise<void>;
  /** Export every contact in the workspace as CSV text. */
  exportCsv(workspaceId: string): Promise<string>;
  /** Bulk-create contacts from CSV; dedupes by email. Returns a summary. */
  importCsv(workspaceId: string, csv: string): Promise<ContactImportResult>;
}

export interface GroupService {
  list(workspaceId: string): Promise<ListResult<Group>>;
  create(workspaceId: string, input: CreateGroupInput): Promise<Group>;
  remove(workspaceId: string, id: string): Promise<void>;
  getVars(workspaceId: string, id: string): Promise<Record<string, string>>;
  setVars(workspaceId: string, id: string, vars: Record<string, string>): Promise<Record<string, string>>;
}

export interface SocialStatus {
  facebook: boolean;
  instagram: boolean;
}
export interface SocialPublishInput {
  targets: ("facebook" | "instagram")[];
  message?: string;
  attachments?: Campaign["attachments"];
  format?: string;
}
export interface SocialResult {
  target: "facebook" | "instagram";
  ok: boolean;
  id?: string;
  format?: string;
  error?: string;
}
export interface SocialInsights {
  target: string;
  id: string;
  metrics: Record<string, unknown>;
}
export interface SocialService {
  status(workspaceId: string): Promise<SocialStatus>;
  publish(workspaceId: string, input: SocialPublishInput): Promise<{ results: SocialResult[] }>;
  insights(workspaceId: string, target: string, id: string): Promise<SocialInsights>;
}

export interface SegmentService {
  list(workspaceId: string): Promise<ListResult<Segment>>;
  create(workspaceId: string, input: CreateSegmentInput): Promise<Segment>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface CreateConversationInput {
  channel: Conversation["channel"];
  contactName: string;
  /** Optional recipient address for outbound delivery (WhatsApp phone / Telegram chat id). */
  contactHandle?: string;
}

export interface SendMessageInput {
  text: string;
}

/** Partial triage update for a conversation. */
export interface UpdateConversationInput {
  resolved?: boolean;
  /** Assignee email, or null / "" to unassign. */
  assignee?: string | null;
  labels?: string[];
}

export interface InboxService {
  conversations(workspaceId: string): Promise<ListResult<Conversation>>;
  messages(workspaceId: string, conversationId: string): Promise<Message[]>;
  createConversation(workspaceId: string, input: CreateConversationInput): Promise<Conversation>;
  sendMessage(workspaceId: string, conversationId: string, input: SendMessageInput): Promise<Message>;
  setResolved(workspaceId: string, conversationId: string, resolved: boolean): Promise<Conversation>;
  updateConversation(
    workspaceId: string,
    conversationId: string,
    input: UpdateConversationInput,
  ): Promise<Conversation>;
}

export interface MediaUploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export interface CreateAssetInput {
  type: MediaAsset["type"];
  title: string;
  url?: string;
  folderId?: string;
  tag?: string;
}

export interface MediaAssetQuery {
  folderId?: string;
  /** Full-text search over the title. */
  q?: string;
  /** Filter by exact tag. */
  tag?: string;
}

export interface UpdateAssetInput {
  title?: string;
  /** Empty string clears the tag. */
  tag?: string;
  /** Empty string moves to the root (no folder). */
  folderId?: string;
}

export interface MediaService {
  folders(workspaceId: string): Promise<MediaFolder[]>;
  assets(workspaceId: string, query?: MediaAssetQuery): Promise<ListResult<MediaAsset>>;
  /** Distinct tags in the workspace (for filter chips). */
  tags(workspaceId: string): Promise<string[]>;
  /** Signed params for a direct browser→Cloudinary upload; null when unconfigured. */
  uploadSignature(workspaceId: string, folder?: string): Promise<MediaUploadSignature | null>;
  createAsset(workspaceId: string, input: CreateAssetInput): Promise<MediaAsset>;
  updateAsset(workspaceId: string, id: string, input: UpdateAssetInput): Promise<MediaAsset>;
  removeAsset(workspaceId: string, id: string): Promise<void>;
}

export interface TemplateService {
  list(workspaceId: string): Promise<ListResult<Template>>;
  create(workspaceId: string, input: CreateTemplateInput): Promise<Template>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface AutomationService {
  list(workspaceId: string): Promise<ListResult<Automation>>;
  create(workspaceId: string, input: CreateAutomationInput): Promise<Automation>;
  update(workspaceId: string, id: string, input: UpdateAutomationInput): Promise<Automation>;
  remove(workspaceId: string, id: string): Promise<void>;
  /** Trigger the automation's n8n webhook and increment its run count. */
  run(workspaceId: string, id: string): Promise<RunAutomationResult>;
}

export interface AnalyticsService {
  /** `days` selects the reporting window (default 30). */
  snapshot(workspaceId: string, days?: number): Promise<AnalyticsSnapshot | null>;
}

export interface ConnectionService {
  list(workspaceId: string): Promise<Connection[]>;
  get(workspaceId: string, id: string): Promise<Connection | null>;
  upsert(workspaceId: string, input: UpsertConnectionInput): Promise<Connection>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface GoogleStatus {
  /** Google OAuth client is configured on the server. */
  configured: boolean;
  /** This workspace has a connected Google account. */
  connected: boolean;
  email: string | null;
}

export interface MarketplaceService {
  catalog(workspaceId: string): Promise<MarketplaceEntry[]>;
  install(workspaceId: string, appId: string): Promise<MarketplaceEntry>;
  uninstall(workspaceId: string, appId: string): Promise<void>;
}

export interface IntegrationService {
  catalog(workspaceId: string): Promise<Integration[]>;
  googleStatus(workspaceId: string): Promise<GoogleStatus>;
  /** Returns the Google consent URL to redirect the browser to. */
  googleAuthUrl(workspaceId: string): Promise<string>;
  googleDisconnect(workspaceId: string): Promise<void>;
}

export interface NotificationService {
  list(workspaceId: string): Promise<Notification[]>;
  unreadCount(workspaceId: string): Promise<number>;
  /** Mark every unread notification in the workspace as read. Returns the count updated. */
  markAllRead(workspaceId: string): Promise<{ updated: number }>;
}

export interface AddMemberInput {
  email: string;
  role: Role;
}

export interface TeamService {
  members(workspaceId: string): Promise<TeamMember[]>;
  roles(workspaceId: string): Promise<RoleDefinition[]>;
  /** Invite a registered user or change an existing member's role (upsert). */
  addMember(workspaceId: string, input: AddMemberInput): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
}

export interface AuditService {
  logs(workspaceId: string): Promise<AuditLogEntry[]>;
}

/**
 * Provider-facing contracts (external integrations). Phase 2 only — declared
 * so the UI and future NestJS modules agree on the shape ahead of time.
 */
export interface AiVariant {
  tag: string;
  text: string;
}

export interface GenerateVariantsInput {
  prompt: string;
  channel: string;
  tone: string;
  /** Content type (caption / anuncio / email / bio / hilo). */
  format?: string;
  /** Desired length (corto / medio / largo). */
  length?: string;
}

export interface AiUsage {
  period: string;
  calls: number;
  tokens: number;
  quota: number | null;
}

export interface AiRecommendation {
  titulo: string;
  detalle: string;
  categoria: string;
}
export interface BestTimes {
  sampleSize: number;
  topDay: string | null;
  topHour: string | null;
  byDay: { label: string; count: number }[];
}
export interface AiRecommendationsResult {
  recommendations: AiRecommendation[];
  times: BestTimes;
  aiConfigured: boolean;
}

export interface AiService {
  generateVariants(workspaceId: string, input: GenerateVariantsInput): Promise<AiVariant[]>;
  suggestHashtags(workspaceId: string, input: { prompt: string }): Promise<string[]>;
  usage(workspaceId: string): Promise<AiUsage>;
  improve(workspaceId: string, input: { message: string }): Promise<{ text: string }>;
  recommendations(workspaceId: string): Promise<AiRecommendationsResult>;
}

export interface SendMessageExternalInput {
  channel: string;
  to: string;
  body: string;
}

export interface MessagingService {
  send(workspaceId: string, input: SendMessageExternalInput): Promise<{ id: string }>;
}

export interface BillingStatus {
  /** Stripe secret key is present on the server. */
  configured: boolean;
  /** The workspace already has a Stripe customer. */
  customer: boolean;
  subscriptionStatus: string | null;
  priceId: string | null;
}

export interface CheckoutInput {
  priceId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateWorkspaceInput {
  name: string;
  kind?: WorkspaceKind;
  accent?: string;
  tagline?: string;
}

export interface WhatsappStatus {
  status: "disconnected" | "connecting" | "qr" | "connected";
  provider: "baileys";
  number: string | null;
  lastConnectionAt: string | null;
  groupsCount: number;
  contactsCount: number;
}

export interface WhatsappService {
  status(workspaceId: string): Promise<WhatsappStatus>;
  connect(workspaceId: string): Promise<WhatsappStatus>;
  reconnect(workspaceId: string): Promise<WhatsappStatus>;
  disconnect(workspaceId: string): Promise<WhatsappStatus>;
  sync(workspaceId: string): Promise<WhatsappStatus>;
}

export interface WorkspaceService {
  /** All workspaces (built-in config + user-created). */
  list(): Promise<Workspace[]>;
  create(input: CreateWorkspaceInput): Promise<Workspace>;
}

export interface BillingService {
  status(workspaceId: string): Promise<BillingStatus>;
  checkout(workspaceId: string, input: CheckoutInput): Promise<{ url: string }>;
  portalUrl(workspaceId: string, returnUrl: string): Promise<string | null>;
}

/** All services the UI can resolve. */
export interface Services {
  workspaces: WorkspaceService;
  whatsapp: WhatsappService;
  campaigns: CampaignService;
  posts: PostService;
  calendar: CalendarService;
  contacts: ContactService;
  groups: GroupService;
  social: SocialService;
  segments: SegmentService;
  inbox: InboxService;
  media: MediaService;
  templates: TemplateService;
  automations: AutomationService;
  designs: DesignService;
  analytics: AnalyticsService;
  connections: ConnectionService;
  integrations: IntegrationService;
  marketplace: MarketplaceService;
  notifications: NotificationService;
  team: TeamService;
  audit: AuditService;
  ai: AiService;
  messaging: MessagingService;
  billing: BillingService;
}
