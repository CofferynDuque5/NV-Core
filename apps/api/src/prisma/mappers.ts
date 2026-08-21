import type {
  Automation as PAutomation,
  AuditLog as PAuditLog,
  CalendarEvent as PCalendarEvent,
  Campaign as PCampaign,
  Connection as PConnection,
  Contact as PContact,
  ContactNote as PContactNote,
  Conversation as PConversation,
  Design as PDesign,
  Group as PGroup,
  MediaAsset as PMediaAsset,
  MediaFolder as PMediaFolder,
  Message as PMessage,
  Notification as PNotification,
  Post as PPost,
  Segment as PSegment,
  Form as PForm,
  Funnel as PFunnel,
  Sequence as PSequence,
  SequenceEnrollment as PSequenceEnrollment,
  Affiliate as PAffiliate,
  AffiliateEvent as PAffiliateEvent,
  Template as PTemplate,
} from "@prisma/client";
import type {
  Automation,
  AuditLogEntry,
  CalendarEvent,
  Campaign,
  ChannelId,
  Connection,
  Contact,
  ContactNote,
  ContactStage,
  Conversation,
  Design,
  DesignFormat,
  Group,
  MediaAsset,
  MediaFolder,
  MediaType,
  Message,
  Notification,
  Post,
  Segment,
  SegmentRule,
  Form,
  FormField,
  Funnel,
  FunnelPage,
  Sequence,
  SequenceStep,
  SequenceEnrollment,
  Affiliate,
  AffiliateEvent,
  Template,
} from "@nv/domain";

const iso = (d: Date | null | undefined): string | undefined => d?.toISOString();

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const mapContact = (c: PContact): Contact => ({
  id: c.id,
  name: c.name,
  phone: c.phone ?? undefined,
  email: c.email ?? undefined,
  company: c.company ?? undefined,
  tags: c.tags,
  stage: c.stage as ContactStage,
  createdAt: c.createdAt.toISOString(),
  lastContactAt: iso(c.lastContactAt),
});

export const mapContactNote = (n: PContactNote): ContactNote => ({
  id: n.id,
  contactId: n.contactId,
  body: n.body,
  author: n.author,
  createdAt: n.createdAt.toISOString(),
});

export const mapGroup = (g: PGroup): Group => ({
  id: g.id,
  name: g.name,
  channel: g.channel as ChannelId,
  members: g.members,
  admins: g.admins,
  description: g.description ?? undefined,
  tags: g.tags,
  lastActivityAt: iso(g.createdAt),
  remoteJid: g.remoteJid ?? undefined,
  synced: g.synced,
});

export const mapSegment = (s: PSegment, count = 0): Segment => ({
  id: s.id,
  name: s.name,
  count,
  color: s.color,
  match: (s.match as Segment["match"]) ?? "all",
  rules: (s.rules as unknown as SegmentRule[]) ?? [],
});

export const mapFunnel = (f: PFunnel): Funnel => ({
  id: f.id,
  name: f.name,
  steps: (f.steps as unknown as FunnelPage[]) ?? [],
  createdAt: f.createdAt.toISOString(),
});

export const mapSequence = (s: PSequence, enrolled = 0): Sequence => ({
  id: s.id,
  name: s.name,
  status: s.status === "paused" ? "paused" : "active",
  steps: (s.steps as unknown as SequenceStep[]) ?? [],
  enrolled,
  createdAt: s.createdAt.toISOString(),
});

export const mapSequenceEnrollment = (e: PSequenceEnrollment): SequenceEnrollment => ({
  id: e.id,
  contactId: e.contactId,
  contactName: e.contactName,
  stepIndex: e.stepIndex,
  status: e.status as SequenceEnrollment["status"],
  nextRunAt: iso(e.nextRunAt),
  createdAt: e.createdAt.toISOString(),
});

export const mapAffiliate = (a: PAffiliate): Affiliate => ({
  id: a.id,
  name: a.name,
  email: a.email,
  code: a.code,
  commissionPct: a.commissionPct,
  destinationUrl: a.destinationUrl ?? undefined,
  status: a.status === "paused" ? "paused" : "active",
  clicks: a.clicks,
  conversions: a.conversions,
  earnings: a.earnings,
  createdAt: a.createdAt.toISOString(),
});

export const mapAffiliateEvent = (e: PAffiliateEvent): AffiliateEvent => ({
  id: e.id,
  type: e.type === "conversion" ? "conversion" : "click",
  amount: e.amount ?? undefined,
  commission: e.commission ?? undefined,
  createdAt: e.createdAt.toISOString(),
});

export const mapForm = (f: PForm): Form => ({
  id: f.id,
  name: f.name,
  fields: (f.fields as unknown as FormField[]) ?? [],
  tags: f.tags ?? [],
  stage: f.stage as Form["stage"],
  submitLabel: f.submitLabel,
  successMessage: f.successMessage,
  redirectUrl: f.redirectUrl ?? undefined,
  views: f.views,
  submissions: f.submissions,
  createdAt: f.createdAt.toISOString(),
});

export const mapCampaign = (
  c: PCampaign & { _count?: { posts: number }; targets?: { groupId: string }[] },
): Campaign => ({
  id: c.id,
  name: c.name,
  status: c.status,
  channels: c.channels as ChannelId[],
  reach: null,
  posts: c._count?.posts ?? 0,
  ctr: null,
  progress: c.progress,
  nextRunAt: iso(c.nextRunAt) ?? null,
  accent: c.accent ?? undefined,
  message: c.message ?? "",
  scheduleType: (c.scheduleType as Campaign["scheduleType"]) ?? "once",
  scheduleAt: c.scheduleAt ?? null,
  scheduleTimes: c.scheduleTimes ?? [],
  scheduleDays: c.scheduleDays ?? [],
  attachments: (c.attachments as Campaign["attachments"]) ?? [],
  socialFormat: c.socialFormat ?? null,
  postToWaStatus: c.postToWaStatus ?? false,
  lastRunAt: iso(c.lastRunAt) ?? null,
  targetGroups: c.targets?.map((t) => t.groupId) ?? [],
});

export const mapPost = (p: PPost & { campaign?: { name: string } | null }): Post => ({
  id: p.id,
  channel: p.channel as ChannelId,
  title: p.title,
  copy: p.copy ?? undefined,
  scheduledAt: iso(p.scheduledAt) ?? null,
  status: p.status,
  campaignId: p.campaignId ?? undefined,
  campaignName: p.campaign?.name,
  hashtags: p.hashtags,
});

export const mapConnection = (c: PConnection): Connection => ({
  id: c.id,
  channel: c.channel as ChannelId,
  handle: c.handle,
  status: c.status,
  token: c.token ?? undefined,
  expiresAt: iso(c.expiresAt),
  webhookStatus: c.webhookStatus ?? undefined,
  permissions: c.permissions,
});

export const mapMediaFolder = (f: PMediaFolder & { _count?: { assets: number } }): MediaFolder => ({
  id: f.id,
  label: f.label,
  count: f._count?.assets ?? 0,
});

export const mapMediaAsset = (a: PMediaAsset): MediaAsset => ({
  id: a.id,
  type: a.type as MediaType,
  title: a.title,
  folderId: a.folderId ?? "",
  tag: a.tag ?? undefined,
  url: a.url ?? undefined,
});

export const mapTemplate = (t: PTemplate): Template => ({
  id: t.id,
  name: t.name,
  category: t.category,
  body: t.body,
  uses: t.uses,
});

export const mapAutomation = (a: PAutomation): Automation => ({
  id: a.id,
  name: a.name,
  status: a.status === "activo" ? "activo" : "pausado",
  runs: a.runs,
  description: a.description ?? "",
  nodes: (a.nodes as unknown as Automation["nodes"]) ?? [],
  edges: (a.edges as unknown as Automation["edges"]) ?? [],
  webhookUrl: a.webhookUrl ?? undefined,
});

export const mapDesign = (d: PDesign): Design => ({
  id: d.id,
  name: d.name,
  format: (d.format as DesignFormat) ?? "square",
  layers: (d.layers as unknown as Design["layers"]) ?? [],
  updatedAt: d.updatedAt.toISOString(),
});

export const mapCalendarEvent = (e: PCalendarEvent): CalendarEvent => ({
  id: e.id,
  date: e.date.toISOString(),
  channel: e.channel as ChannelId,
  title: e.title,
  campaignId: e.campaignId ?? undefined,
});

export const mapConversation = (c: PConversation): Conversation => ({
  id: c.id,
  channel: c.channel as ChannelId,
  contactName: c.contactName,
  contactInitials: initials(c.contactName),
  contactHandle: c.contactHandle ?? undefined,
  preview: "",
  unread: 0,
  lastMessageAt: c.createdAt.toISOString(),
  assignee: c.assignee ?? undefined,
  labels: c.labels ?? [],
  resolved: c.resolved,
});

export const mapMessage = (m: PMessage): Message => ({
  id: m.id,
  conversationId: m.conversationId,
  direction: m.direction === "in" ? "in" : "out",
  text: m.text,
  at: m.createdAt.toISOString(),
});

export const mapNotification = (n: PNotification): Notification => ({
  id: n.id,
  type: (n.type as Notification["type"]) ?? "info",
  title: n.title,
  meta: n.meta ?? undefined,
  read: n.read,
  createdAt: n.createdAt.toISOString(),
});

export const mapAuditLog = (a: PAuditLog): AuditLogEntry => ({
  id: a.id,
  actor: a.actor,
  action: a.action,
  target: a.target ?? undefined,
  createdAt: a.createdAt.toISOString(),
});
