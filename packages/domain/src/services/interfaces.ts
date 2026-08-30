import type {
  AnalyticsSnapshot,
  Automation,
  AutomationTestResult,
  Campaign,
  CampaignImportResult,
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
  ChangelogStatus,
  Affiliate,
  AffiliateEvent,
  Feedback,
  Form,
  Funnel,
  Sequence,
  SequenceEnrollment,
  SequenceEnrollResult,
  SequencePreviewStep,
  MediaAsset,
  MediaFolder,
  Message,
  Notification,
  OnboardingStatus,
  SystemStatus,
  Post,
  RoleDefinition,
  Segment,
  SegmentPreview,
  SendLogEntry,
  Template,
  TemplateImportResult,
  TeamMember,
  AuditLogEntry,
  Workspace,
} from "../entities";
import type { ChannelId, ContactStage, Role, WorkspaceKind } from "../enums";
import type { PlanId, PlanLimits } from "../config/plans";

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

export interface CreateFeedbackInput {
  type: Feedback["type"];
  rating?: number;
  message: string;
}

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
  scheduleTimes?: string[];
  scheduleDays?: number[];
  attachments?: Campaign["attachments"];
  socialFormat?: string;
  postToWaStatus?: boolean;
  targetGroups?: string[];
}
export type UpdateCampaignInput = Partial<CreateCampaignInput>;

export interface CreateSegmentInput {
  name: string;
  color?: string;
  match?: Segment["match"];
  rules?: Segment["rules"];
}
export type UpdateSegmentInput = Partial<CreateSegmentInput>;

export interface CreateGroupInput {
  name: string;
  channel?: Group["channel"];
  kind?: Group["kind"];
  description?: string;
  tags?: string[];
  members?: number;
  /** Destination id: WhatsApp JID or Telegram chat_id/@channel (e.g. "-1001234567890"). */
  remoteJid?: string;
}

export type UpdateGroupInput = Partial<Pick<CreateGroupInput, "name" | "tags">>;

export interface CreateTemplateInput {
  name: string;
  body: string;
  category?: string;
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

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

/** Input for a workflow test-run: a sample context the conditions evaluate against. */
export interface TestAutomationInput {
  context?: Record<string, string>;
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
  clearLogs(workspaceId: string): Promise<{ deleted: number }>;
  /** Export all campaigns as CSV, incl. recipient groups by name. */
  exportCsv(workspaceId: string): Promise<string>;
  /** Import campaigns from CSV; dedupes by name, resolves recipient groups. */
  importCsv(workspaceId: string, csv: string): Promise<CampaignImportResult>;
}

export interface CreatePostInput {
  channel: Post["channel"];
  title: string;
  copy?: string;
  hashtags?: string[];
  attachments?: Post["attachments"];
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
  update(workspaceId: string, id: string, input: UpdateGroupInput): Promise<Group>;
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
  update(workspaceId: string, id: string, input: UpdateSegmentInput): Promise<Segment>;
  remove(workspaceId: string, id: string): Promise<void>;
  /** Evaluate rules against the contact base without persisting a segment. */
  preview(workspaceId: string, input: { match?: Segment["match"]; rules: Segment["rules"] }): Promise<SegmentPreview>;
}

export interface CreateFormInput {
  name: string;
  fields?: Form["fields"];
  tags?: string[];
  stage?: Form["stage"];
  submitLabel?: string;
  successMessage?: string;
  redirectUrl?: string;
}
export type UpdateFormInput = Partial<CreateFormInput>;

export interface FormService {
  list(workspaceId: string): Promise<ListResult<Form>>;
  create(workspaceId: string, input: CreateFormInput): Promise<Form>;
  update(workspaceId: string, id: string, input: UpdateFormInput): Promise<Form>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface CreateFunnelInput {
  name: string;
  steps?: Funnel["steps"];
}
export type UpdateFunnelInput = Partial<CreateFunnelInput>;

export interface FunnelService {
  list(workspaceId: string): Promise<ListResult<Funnel>>;
  create(workspaceId: string, input: CreateFunnelInput): Promise<Funnel>;
  update(workspaceId: string, id: string, input: UpdateFunnelInput): Promise<Funnel>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface CreateSequenceInput {
  name: string;
  status?: Sequence["status"];
  steps?: Sequence["steps"];
}
export type UpdateSequenceInput = Partial<CreateSequenceInput>;

export interface CreateAffiliateInput {
  name: string;
  email: string;
  code?: string;
  commissionPct?: number;
  destinationUrl?: string;
  status?: Affiliate["status"];
}
export type UpdateAffiliateInput = Partial<CreateAffiliateInput>;

export interface AffiliateService {
  list(workspaceId: string): Promise<ListResult<Affiliate>>;
  create(workspaceId: string, input: CreateAffiliateInput): Promise<Affiliate>;
  update(workspaceId: string, id: string, input: UpdateAffiliateInput): Promise<Affiliate>;
  remove(workspaceId: string, id: string): Promise<void>;
  /** Record a conversion (a referred sale) and credit the commission. */
  convert(workspaceId: string, id: string, amount: number): Promise<Affiliate>;
  /** Recent referral events (clicks + conversions) for the panel. */
  events(workspaceId: string, id: string): Promise<AffiliateEvent[]>;
}

export interface SequenceService {
  list(workspaceId: string): Promise<ListResult<Sequence>>;
  create(workspaceId: string, input: CreateSequenceInput): Promise<Sequence>;
  update(workspaceId: string, id: string, input: UpdateSequenceInput): Promise<Sequence>;
  remove(workspaceId: string, id: string): Promise<void>;
  /** Enroll a single contact or everyone with a tag into the sequence. */
  enroll(workspaceId: string, id: string, input: { contactId?: string; tag?: string }): Promise<SequenceEnrollResult>;
  /** Active/finished enrollments for the sequence. */
  enrollments(workspaceId: string, id: string): Promise<SequenceEnrollment[]>;
  /** Computed send schedule (offsets from enrollment) — a dry-run preview. */
  preview(workspaceId: string, id: string): Promise<SequencePreviewStep[]>;
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
  /** Upload a base64 image via the backend (ImgBB) and get its public URL. */
  uploadImage(workspaceId: string, image: string): Promise<{ url: string }>;
  createAsset(workspaceId: string, input: CreateAssetInput): Promise<MediaAsset>;
  updateAsset(workspaceId: string, id: string, input: UpdateAssetInput): Promise<MediaAsset>;
  removeAsset(workspaceId: string, id: string): Promise<void>;
}

export interface TemplateService {
  list(workspaceId: string): Promise<ListResult<Template>>;
  create(workspaceId: string, input: CreateTemplateInput): Promise<Template>;
  update(workspaceId: string, id: string, input: UpdateTemplateInput): Promise<Template>;
  remove(workspaceId: string, id: string): Promise<void>;
  /** Export all templates as CSV (name, category, body). */
  exportCsv(workspaceId: string): Promise<string>;
  /** Import templates from CSV; dedupes by name. */
  importCsv(workspaceId: string, csv: string): Promise<TemplateImportResult>;
}

export interface AutomationService {
  list(workspaceId: string): Promise<ListResult<Automation>>;
  create(workspaceId: string, input: CreateAutomationInput): Promise<Automation>;
  update(workspaceId: string, id: string, input: UpdateAutomationInput): Promise<Automation>;
  remove(workspaceId: string, id: string): Promise<void>;
  /** Trigger the automation's n8n webhook and increment its run count. */
  run(workspaceId: string, id: string): Promise<RunAutomationResult>;
  /** Dry-run the flow graph against a sample context; returns the execution trace. */
  test(workspaceId: string, id: string, input?: TestAutomationInput): Promise<AutomationTestResult>;
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

/** A pending invitation for an email that has no account yet. */
export interface TeamInvitation {
  id: string;
  email: string;
  role: Role;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Result of addMember: whether an existing user was added or an email invited. */
export interface AddMemberResult {
  status: "added" | "invited";
}

export interface TeamService {
  members(workspaceId: string): Promise<TeamMember[]>;
  roles(workspaceId: string): Promise<RoleDefinition[]>;
  /**
   * Add a registered user (or change their role), OR invite an email that has
   * no account yet — the invitee joins automatically when they register.
   */
  addMember(workspaceId: string, input: AddMemberInput): Promise<AddMemberResult>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  /** Pending invitations (emails invited but not yet registered). */
  invitations(workspaceId: string): Promise<TeamInvitation[]>;
  /** Revoke a pending invitation. */
  revokeInvitation(workspaceId: string, invitationId: string): Promise<void>;
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

/** One planned post in an AI-generated content plan. */
export interface AiContentPlanItem {
  /** 1-based day offset from today. */
  day: number;
  channel: ChannelId;
  title: string;
  copy: string;
  hashtags?: string[];
}

export interface GenerateContentPlanInput {
  topic: string;
  /** Number of days to plan (default 7). */
  days?: number;
  /** Channels to spread the plan across (default a sensible mix). */
  channels?: ChannelId[];
  tone?: string;
}

export interface AiUsage {
  period: string;
  calls: number;
  tokens: number;
  /** Effective monthly quota (plan limit, capped by any operator override). `null` = unlimited. */
  quota: number | null;
  /** Effective plan for this workspace — lets the UI show a tier-aware upgrade prompt. */
  planId: PlanId;
  planName: string;
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
  generateContentPlan(
    workspaceId: string,
    input: GenerateContentPlanInput,
  ): Promise<AiContentPlanItem[]>;
  suggestHashtags(workspaceId: string, input: { prompt: string }): Promise<string[]>;
  /** Generate a flyer image from a prompt. Returns a URL (data: or hosted). */
  generateImage(
    workspaceId: string,
    input: { prompt: string; size?: string },
  ): Promise<{ url: string }>;
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

export interface PlanUsage {
  contacts: number;
  campaigns: number;
  teamMembers: number;
  aiCalls: number;
}

export interface BillingStatus {
  /** Stripe secret key is present on the server. */
  configured: boolean;
  /** The workspace already has a Stripe customer. */
  customer: boolean;
  subscriptionStatus: string | null;
  priceId: string | null;
  /** Effective plan for this workspace ("free" | "pro"). */
  planId: PlanId;
  planName: string;
  /** The plan's limits (null value = unlimited). */
  limits: PlanLimits;
  /** Current usage counts for the limited resources. */
  usage: PlanUsage;
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
  /** Last failure reason, surfaced in the panel (null when healthy). */
  error?: string | null;
}

export interface WhatsappService {
  status(workspaceId: string): Promise<WhatsappStatus>;
  connect(workspaceId: string): Promise<WhatsappStatus>;
  reconnect(workspaceId: string): Promise<WhatsappStatus>;
  disconnect(workspaceId: string): Promise<WhatsappStatus>;
  sync(workspaceId: string): Promise<WhatsappStatus>;
}

export interface TelegramStatus {
  // "password" = the account has 2FA; it's waiting for the user's password.
  status: "disconnected" | "connecting" | "qr" | "password" | "connected";
  provider: "mtproto";
  username: string | null;
  phone: string | null;
  lastConnectionAt: string | null;
  groupsCount: number;
  /** Last failure reason, surfaced in the panel (null when healthy). */
  error?: string | null;
}

export interface TelegramService {
  status(workspaceId: string): Promise<TelegramStatus>;
  connect(workspaceId: string): Promise<TelegramStatus>;
  reconnect(workspaceId: string): Promise<TelegramStatus>;
  disconnect(workspaceId: string): Promise<TelegramStatus>;
  sync(workspaceId: string): Promise<TelegramStatus>;
  /** Submit the 2FA password when status is "password". */
  submitPassword(workspaceId: string, password: string): Promise<TelegramStatus>;
}

/** A user as seen by the platform super-admin, with all their memberships. */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  memberships: { workspaceSlug: string; role: Role }[];
}

/** Platform super-admin: control every user and their roles across workspaces. */
export interface AdminService {
  users(): Promise<AdminUser[]>;
  workspaces(): Promise<Workspace[]>;
  setMembership(input: { email: string; workspaceSlug: string; role: Role }): Promise<{ ok: true }>;
  removeMembership(userId: string, workspaceSlug: string): Promise<void>;
}

export interface WorkspaceService {
  /** All workspaces (built-in config + user-created). */
  list(): Promise<Workspace[]>;
  create(input: CreateWorkspaceInput): Promise<Workspace>;
}

export interface OnboardingService {
  /** The workspace's first-value checklist, with data-derived completion. */
  status(workspaceId: string): Promise<OnboardingStatus>;
  /** Hide the checklist for the current user; returns the updated status. */
  dismiss(workspaceId: string): Promise<OnboardingStatus>;
}

export interface ChangelogService {
  /** The current user's changelog state (product-wide, not workspace-scoped). */
  status(): Promise<ChangelogStatus>;
  /** Mark all current entries as seen; returns the updated status. */
  markSeen(): Promise<ChangelogStatus>;
}

export interface FeedbackService {
  /** Submit in-app feedback for the current workspace. */
  submit(workspaceId: string, input: CreateFeedbackInput): Promise<Feedback>;
}

export interface SystemService {
  /** Live platform health (public; product-wide, not workspace-scoped). */
  status(): Promise<SystemStatus>;
}

export interface BillingService {
  status(workspaceId: string): Promise<BillingStatus>;
  checkout(workspaceId: string, input: CheckoutInput): Promise<{ url: string }>;
  portalUrl(workspaceId: string, returnUrl: string): Promise<string | null>;
}

/** All services the UI can resolve. */
export interface Services {
  workspaces: WorkspaceService;
  onboarding: OnboardingService;
  changelog: ChangelogService;
  feedback: FeedbackService;
  system: SystemService;
  whatsapp: WhatsappService;
  telegram: TelegramService;
  admin: AdminService;
  campaigns: CampaignService;
  posts: PostService;
  calendar: CalendarService;
  contacts: ContactService;
  groups: GroupService;
  social: SocialService;
  segments: SegmentService;
  forms: FormService;
  funnels: FunnelService;
  sequences: SequenceService;
  affiliates: AffiliateService;
  inbox: InboxService;
  media: MediaService;
  templates: TemplateService;
  automations: AutomationService;
  designs: DesignService;
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
