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
}

export interface Automation {
  id: string;
  name: string;
  status: "activo" | "pausado";
  runs: number;
  description: string;
  nodes: AutomationNode[];
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
}

export interface AnalyticsSnapshot {
  kpis: KpiMetric[];
  funnel: FunnelStep[];
  platforms: PlatformShare[];
  heatmap: number[][];
  topCampaigns: Campaign[];
}
