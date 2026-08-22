import type {
  AutomationNodeType,
  CampaignStatus,
  ChannelId,
  ConnectionStatus,
  ContactStage,
  MediaType,
  FormFieldKey,
  FunnelStepType,
  SequenceChannel,
  ModuleId,
  PostStatus,
  Role,
  SegmentField,
  SegmentMatch,
  SegmentOperator,
  WorkspaceKind,
} from "../enums";

/**
 * Domain entities.
 *
 * These describe the SHAPE of platform data only. No records are declared
 * here — the application starts empty and data will arrive from the backend
 * (phase 2) via the service layer.
 */

export interface Workspace {
  id: string;
  /** URL slug, e.g. "nv-streaming". */
  slug: string;
  name: string;
  kind: WorkspaceKind;
  /** Accent color (hex) used for branding. */
  accent: string;
  /** 1–2 letter monogram. */
  initials: string;
  /** Short tagline describing the vertical. */
  tagline?: string;
  /** Core modules enabled for this workspace. */
  enabledModules: ModuleId[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  online: boolean;
  avatarColor: string;
  plan?: string;
}

export interface TeamMember extends User {}

export interface RoleDefinition {
  id: string;
  name: Role | string;
  description: string;
  userCount: number;
}

export interface PermissionRow {
  permission: string;
  /** One boolean per role, aligned with the roles matrix header. */
  roles: boolean[];
}

export interface Channel {
  id: ChannelId;
  name: string;
  color: string;
  softColor: string;
}

export interface ConnectionLog {
  id: string;
  label: string;
  when: string;
  color?: string;
}

export interface Connection {
  id: string;
  channel: ChannelId;
  handle: string;
  status: ConnectionStatus;
  metric?: string;
  token?: string;
  expiresAt?: string;
  webhookStatus?: string;
  permissions?: string[];
  logs?: ConnectionLog[];
}

/** Media descriptor attached to a campaign. */
export interface CampaignAttachment {
  url?: string;
  kind?: "image" | "video" | "document" | string;
  mime?: string | null;
  filename?: string | null;
  path?: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  channels: ChannelId[];
  reach: string | null;
  posts: number;
  ctr: string | null;
  /** 0–100 completion. */
  progress: number;
  nextRunAt: string | null;
  accent?: string;
  /** Message body sent to WhatsApp groups (supports {{variables}}). */
  message?: string;
  /** "once" | "daily" | "weekly". */
  scheduleType?: "once" | "daily" | "weekly";
  /** once → ISO datetime; daily/weekly → "HH:MM". */
  scheduleAt?: string | null;
  /** daily/weekly → multiple send times per day ["HH:MM", …]. */
  scheduleTimes?: string[];
  /** weekly → days of week (0=Sun … 6=Sat). */
  scheduleDays?: number[];
  attachments?: CampaignAttachment[];
  /** IG format: "feed" | "reel" | "story" | "carousel". */
  socialFormat?: string | null;
  /** When true, also publish to the connected WhatsApp Status (Estados). */
  postToWaStatus?: boolean;
  /** Ids of the WhatsApp groups this campaign targets. */
  targetGroups?: string[];
  lastRunAt?: string | null;
}

export interface Post {
  id: string;
  channel: ChannelId;
  title: string;
  copy?: string;
  scheduledAt: string | null;
  status: PostStatus;
  campaignId?: string;
  campaignName?: string;
  hashtags?: string[];
  /** Media descriptors (shared with the content editor preview). */
  attachments?: CampaignAttachment[];
  stats?: Record<string, string>;
}

/** One delivery attempt (WhatsApp group or social) in the send history. */
export interface SendLogEntry {
  id: string;
  campaignId?: string | null;
  campaignName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  /** "wa" | "facebook" | "instagram". */
  target?: string | null;
  postId?: string | null;
  format?: string | null;
  preview?: string | null;
  ok: boolean;
  error?: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  tags: string[];
  stage: ContactStage;
  createdAt: string;
  lastContactAt?: string;
  avatarHue?: number;
}

/** Result of a bulk contact CSV import. */
export interface ContactImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface Group {
  id: string;
  name: string;
  channel: ChannelId;
  members: number;
  admins: number;
  description?: string;
  tags: string[];
  lastActivityAt?: string;
  avatarHue?: number;
  /** WhatsApp group JID (present when synced from Baileys). */
  remoteJid?: string;
  /** True when populated from a WhatsApp sync. */
  synced?: boolean;
}

export interface SegmentRule {
  field: SegmentField;
  operator: SegmentOperator;
  /** Comparison value; ignored by valueless operators (is_set / is_empty). */
  value: string;
}

export interface Segment {
  id: string;
  name: string;
  /** Live count of contacts matching this segment's rules. */
  count: number;
  color: string;
  /** How the rules combine: match all (AND) or any (OR). Defaults to "all". */
  match: SegmentMatch;
  rules: SegmentRule[];
}

/** Result of evaluating a segment's rules against the contact base. */
export interface SegmentPreview {
  count: number;
  /** A capped sample of matching contacts, for the rule-builder preview. */
  sample: Contact[];
}

// ── Lead-capture forms (opt-in) ──────────────────────────────────────────────

/** A field a capture form collects, mapped to a Contact attribute. */
export interface FormField {
  key: FormFieldKey;
  label: string;
  required: boolean;
}

/** A public lead-capture form that turns a submission into a Contact. */
export interface Form {
  id: string;
  name: string;
  fields: FormField[];
  /** Tags applied to contacts created via this form. */
  tags: string[];
  /** CRM stage assigned to new contacts. */
  stage: ContactStage;
  submitLabel: string;
  successMessage: string;
  redirectUrl?: string;
  /** Lifetime view + submission counters (for the conversion rate). */
  views: number;
  submissions: number;
  createdAt: string;
}

/** The public-safe subset used to render an embeddable form (no tags/stage). */
export interface PublicForm {
  id: string;
  name: string;
  fields: FormField[];
  submitLabel: string;
}

/** Outcome of a public form submission. */
export interface FormSubmitResult {
  ok: boolean;
  successMessage: string;
  redirectUrl?: string;
}

// ── Affiliate program ────────────────────────────────────────────────────────

/** A referral partner with a unique code, commission rate and live stats. */
export interface Affiliate {
  id: string;
  name: string;
  email: string;
  /** Unique referral code used in the /r/:code link. */
  code: string;
  /** Commission percentage (0–100) applied to each conversion amount. */
  commissionPct: number;
  /** Where the referral link redirects (defaults to the app when unset). */
  destinationUrl?: string;
  status: "active" | "paused";
  clicks: number;
  conversions: number;
  /** Accrued commission (sum of amount × commissionPct). */
  earnings: number;
  createdAt: string;
}

/** One tracked referral event (a click on the link or a recorded conversion). */
export interface AffiliateEvent {
  id: string;
  type: "click" | "conversion";
  /** Sale amount, for conversion events. */
  amount?: number;
  /** Commission credited, for conversion events. */
  commission?: number;
  createdAt: string;
}

// ── Sequences / autoresponders (drip) ───────────────────────────────────────

/** One step of a drip sequence: sent `delayDays` after the previous step. */
export interface SequenceStep {
  id: string;
  /** Days to wait after the previous step (step 0 = after enrollment). */
  delayDays: number;
  channel: SequenceChannel;
  subject?: string;
  body: string;
}

export interface Sequence {
  id: string;
  name: string;
  status: "active" | "paused";
  steps: SequenceStep[];
  /** Count of currently-active enrollments. */
  enrolled: number;
  createdAt: string;
}

/** A contact's progress through a sequence. */
export interface SequenceEnrollment {
  id: string;
  contactId: string;
  contactName: string;
  stepIndex: number;
  status: "active" | "completed" | "cancelled";
  nextRunAt?: string;
  createdAt: string;
}

/** A computed schedule row for the sequence preview (offset from enrollment). */
export interface SequencePreviewStep {
  index: number;
  channel: SequenceChannel;
  offsetDays: number;
  body: string;
}

/** Result of enrolling contacts into a sequence. */
export interface SequenceEnrollResult {
  enrolled: number;
  skipped: number;
}

// ── Funnels (multi-step opt-in → sales → thank-you) ──────────────────────────

/** One page/step of a funnel. Opt-in steps embed a form; others show content. */
export interface FunnelPage {
  id: string;
  name: string;
  type: FunnelStepType;
  /** For opt-in steps: the form to embed (id). */
  formId?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  /** Per-step visit counter (approximate; for the funnel report). */
  views: number;
}

export interface Funnel {
  id: string;
  name: string;
  steps: FunnelPage[];
  createdAt: string;
}

/** Public render payload for a single funnel step (no analytics leaked). */
export interface PublicFunnelStep {
  funnelId: string;
  index: number;
  total: number;
  name: string;
  type: FunnelStepType;
  formId?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  /** Next step index, or null when this is the last step. */
  nextIndex: number | null;
}

export interface MediaAsset {
  id: string;
  type: MediaType;
  title: string;
  folderId: string;
  tag?: string;
  url?: string;
  hue?: number;
}

export interface MediaFolder {
  id: string;
  label: string;
  count: number;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  uses: number;
}

/** Summary of a CSV template import: created, skipped (duplicate name), errors. */
export interface TemplateImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

/** Summary of a CSV campaign import (incl. recipient groups by name). */
export interface CampaignImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  label: string;
  /** Canvas position for the visual editor (optional for legacy flows). */
  x?: number;
  y?: number;
  /** Per-node settings: trigger event, action kind + params, wait, condition. */
  config?: Record<string, unknown>;
}

/** Directed connection between two nodes in the flow graph. */
export interface AutomationEdge {
  id: string;
  from: string; // source node id
  to: string; // target node id
  /** For edges leaving a condition node: which branch this edge represents. */
  branch?: "true" | "false";
}

/** One step of an automation execution/test trace. */
export interface AutomationTraceStep {
  nodeId: string;
  type: AutomationNodeType;
  label: string;
  /** For condition nodes: which branch the evaluation took. */
  decision?: "true" | "false";
  /** Human-readable description of what happened (or would happen, in a test). */
  note: string;
}

/** Result of a workflow test-run (dry-run): the ordered execution trace. */
export interface AutomationTestResult {
  steps: AutomationTraceStep[];
  /** Set when the graph couldn't be executed (e.g. no trigger). */
  error?: string;
}

export interface Automation {
  id: string;
  name: string;
  status: "activo" | "pausado";
  runs: number;
  description: string;
  nodes: AutomationNode[];
  /** Connections between nodes (optional; older flows are node-only). */
  edges?: AutomationEdge[];
  /** Optional n8n webhook (absolute URL or path) triggered when the flow runs. */
  webhookUrl?: string;
}

export interface CalendarEvent {
  id: string;
  date: string;
  channel: ChannelId;
  title: string;
  campaignId?: string;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  description: string;
  hue?: number;
  /** Module where this integration is configured (deep-link target). */
  module?: ModuleId;
  /** Short hint on how to enable it (e.g. which env var / OAuth flow). */
  setupHint?: string;
}

export interface Conversation {
  id: string;
  channel: ChannelId;
  contactName: string;
  contactInitials: string;
  /** Recipient address for outbound delivery (WhatsApp phone / Telegram chat id). */
  contactHandle?: string;
  preview: string;
  unread: number;
  lastMessageAt: string;
  assignee?: string;
  /** Triage labels. */
  labels?: string[];
  resolved: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  text: string;
  at: string;
}

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  meta?: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target?: string;
  createdAt: string;
}

export interface KpiMetric {
  label: string;
  value: string;
  delta?: string;
  deltaTrend?: "up" | "down";
}

export interface FunnelStep {
  label: string;
  value: string;
  pct: number;
  accent: string;
}

export interface PlatformShare {
  channel: ChannelId;
  pct: string;
  /** Absolute count in the selected period (optional; older callers omit it). */
  count?: number;
}

/** One daily bucket of activity across the workspace, for time-series charts. */
export interface AnalyticsPoint {
  /** ISO date (YYYY-MM-DD), start of the day. */
  date: string;
  posts: number;
  contacts: number;
  conversations: number;
  messages: number;
}

/** The window a snapshot was computed over. */
export interface AnalyticsRange {
  days: number;
  from: string;
  to: string;
}

export interface AnalyticsSnapshot {
  kpis: KpiMetric[];
  funnel: FunnelStep[];
  platforms: PlatformShare[];
  heatmap: number[][];
  topCampaigns: Campaign[];
  /** Period the snapshot covers (optional for backward compatibility). */
  range?: AnalyticsRange;
  /** Daily activity buckets over the period, oldest → newest. */
  series?: AnalyticsPoint[];
  /** Derived conversion / engagement rates (reuses the FunnelStep shape). */
  conversion?: FunnelStep[];
}

// ── Campaign Builder (visual creative editor) ────────────────────────────────

/** Canvas aspect presets for a design. */
export type DesignFormat = "square" | "portrait" | "story" | "landscape";

export type DesignLayerType = "text" | "rect" | "button" | "image";

/**
 * A single positioned layer on the design canvas. Coordinates and sizes are in
 * canvas units (the format's pixel space), so a design renders identically at
 * any display scale.
 */
export interface DesignLayer {
  id: string;
  type: DesignLayerType;
  x: number;
  y: number;
  w: number;
  h: number;
  // Text / button label
  text?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  weight?: number;
  // Box / button background
  fill?: string;
  radius?: number;
  // Image
  src?: string;
}

export interface Design {
  id: string;
  name: string;
  format: DesignFormat;
  layers: DesignLayer[];
  updatedAt?: string;
}

/** A CRM activity note logged against a contact. */
export interface ContactNote {
  id: string;
  contactId: string;
  body: string;
  author: string;
  createdAt: string;
}

// ── Onboarding (guided first-value checklist) ────────────────────────────────

/** The steps a new workspace completes on the way to its first published post. */
export type OnboardingStepKey = "connect" | "audience" | "content" | "publish";

/** One checklist step with its data-derived completion state. */
export interface OnboardingStep {
  key: OnboardingStepKey;
  done: boolean;
}

/**
 * A workspace's onboarding progress. Step completion is derived from real
 * workspace data (a connection exists, contacts exist, a post was published…);
 * `dismissed` is the current user's choice to hide the checklist.
 */
export interface OnboardingStatus {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  allDone: boolean;
  dismissed: boolean;
}

// ── Feedback (in-app) ────────────────────────────────────────────────────────

/** What kind of feedback the user is sending. */
export type FeedbackType = "idea" | "bug" | "question" | "other";

export const FEEDBACK_TYPES: FeedbackType[] = ["idea", "bug", "question", "other"];

/** A feedback submission from a workspace member. */
export interface Feedback {
  id: string;
  type: FeedbackType;
  /** Optional 1–5 satisfaction score. */
  rating?: number;
  message: string;
  author: string;
  createdAt: string;
}

// ── System status (health) ───────────────────────────────────────────────────

export type StatusLevel = "operational" | "degraded" | "down" | "unknown";

/** Health of a single platform component. */
export interface StatusComponent {
  key: string;
  name: string;
  status: StatusLevel;
  detail?: string;
}

/** Overall platform status, aggregated from its components. */
export interface SystemStatus {
  overall: StatusLevel;
  components: StatusComponent[];
  timestamp: string;
}

// ── Changelog (per-user "unseen" state) ──────────────────────────────────────

/**
 * The current user's changelog state. `unseenCount` is how many published
 * entries are newer than `lastSeenAt` (null = the user has never opened it).
 */
export interface ChangelogStatus {
  lastSeenAt: string | null;
  unseenCount: number;
}
