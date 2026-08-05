import type {
  AutomationNodeType,
  CampaignStatus,
  ChannelId,
  ConnectionStatus,
  ContactStage,
  MediaType,
  ModuleId,
  PostStatus,
  Role,
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
  /** weekly → days of week (0=Sun … 6=Sat). */
  scheduleDays?: number[];
  attachments?: CampaignAttachment[];
  /** IG format: "feed" | "reel" | "story" | "carousel". */
  socialFormat?: string | null;
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
  field: string;
  operator: string;
  value: string;
}

export interface Segment {
  id: string;
  name: string;
  count: number;
  color: string;
  rules: SegmentRule[];
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
