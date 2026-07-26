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
import type { Role } from "../enums";

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
  webhookUrl?: string;
}

export interface RunAutomationResult {
  triggered: boolean;
  runs: number;
}

export interface CampaignService {
  list(workspaceId: string): Promise<ListResult<Campaign>>;
  get(workspaceId: string, id: string): Promise<Campaign | null>;
  create(workspaceId: string, input: CreateCampaignInput): Promise<Campaign>;
  update(workspaceId: string, id: string, input: UpdateCampaignInput): Promise<Campaign>;
  remove(workspaceId: string, id: string): Promise<void>;
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

export interface PostService {
  list(workspaceId: string): Promise<ListResult<Post>>;
  today(workspaceId: string): Promise<Post[]>;
  create(workspaceId: string, input: CreatePostInput): Promise<Post>;
  remove(workspaceId: string, id: string): Promise<void>;
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

export interface CreateConversationInput {
  channel: Conversation["channel"];
  contactName: string;
  /** Optional recipient address for outbound delivery (WhatsApp phone / Telegram chat id). */
  contactHandle?: string;
}

export interface SendMessageInput {
  text: string;
}

export interface InboxService {
  conversations(workspaceId: string): Promise<ListResult<Conversation>>;
  messages(workspaceId: string, conversationId: string): Promise<Message[]>;
  createConversation(workspaceId: string, input: CreateConversationInput): Promise<Conversation>;
  sendMessage(workspaceId: string, conversationId: string, input: SendMessageInput): Promise<Message>;
  setResolved(workspaceId: string, conversationId: string, resolved: boolean): Promise<Conversation>;
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

export interface MediaService {
  folders(workspaceId: string): Promise<MediaFolder[]>;
  assets(workspaceId: string, folderId?: string): Promise<ListResult<MediaAsset>>;
  /** Signed params for a direct browser→Cloudinary upload; null when unconfigured. */
  uploadSignature(workspaceId: string, folder?: string): Promise<MediaUploadSignature | null>;
  createAsset(workspaceId: string, input: CreateAssetInput): Promise<MediaAsset>;
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
  remove(workspaceId: string, id: string): Promise<void>;
  /** Trigger the automation's n8n webhook and increment its run count. */
  run(workspaceId: string, id: string): Promise<RunAutomationResult>;
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

export interface GoogleStatus {
  /** Google OAuth client is configured on the server. */
  configured: boolean;
  /** This workspace has a connected Google account. */
  connected: boolean;
  email: string | null;
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
}

export interface AiService {
  generateVariants(workspaceId: string, input: GenerateVariantsInput): Promise<AiVariant[]>;
  suggestHashtags(workspaceId: string, input: { prompt: string }): Promise<string[]>;
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

export interface BillingService {
  status(workspaceId: string): Promise<BillingStatus>;
  checkout(workspaceId: string, input: CheckoutInput): Promise<{ url: string }>;
  portalUrl(workspaceId: string, returnUrl: string): Promise<string | null>;
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
