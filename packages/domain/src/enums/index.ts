/** Communication channels supported across the platform. */
export const CHANNEL_IDS = ["wa", "ig", "fb", "tk", "tg", "x", "th", "email"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** Lifecycle states of a campaign. */
export const CAMPAIGN_STATUSES = [
  "borrador",
  "programada",
  "activa",
  "pausada",
  "completada",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Lifecycle states of an individual post. */
export const POST_STATUSES = ["draft", "scheduled", "publishing", "sent", "error"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Health of a provider/channel connection. */
export const CONNECTION_STATUSES = ["ok", "warn", "down"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** CRM stage of a contact. */
export const CONTACT_STAGES = ["Lead", "Cliente", "En riesgo", "Inactivo"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

/** Roles within a workspace (RBAC). */
export const ROLES = ["Owner", "Admin", "Editor", "Visor"] as const;
export type Role = (typeof ROLES)[number];

/** Contact fields a segment rule can filter on. */
export const SEGMENT_FIELDS = [
  "name",
  "email",
  "phone",
  "company",
  "tags",
  "stage",
  "createdAt",
  "lastContactAt",
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];

/** Comparison operators available to segment rules. */
export const SEGMENT_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_set",
  "is_empty",
  "in",
  "has_tag",
  "not_has_tag",
  "before",
  "after",
  "in_last_days",
  "not_in_last_days",
] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

/** How a segment's rules combine: match all (AND) or any (OR). */
export const SEGMENT_MATCH_MODES = ["all", "any"] as const;
export type SegmentMatch = (typeof SEGMENT_MATCH_MODES)[number];

/** Node types of an automation flow. */
export const AUTOMATION_NODE_TYPES = ["trigger", "action", "wait", "cond"] as const;
export type AutomationNodeType = (typeof AUTOMATION_NODE_TYPES)[number];

/** Vertical of a workspace. */
export const WORKSPACE_KINDS = [
  "creative",
  "software",
  "health",
  "design",
  "tourism",
  "ecommerce",
  "marketing",
  "ai",
  "fitness",
  "security",
  "streaming",
  "media",
] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

/** Every Core module id. */
export const MODULE_IDS = [
  "dashboard",
  "calendario",
  "campanas",
  "contactos",
  "grupos",
  "segmentos",
  "inbox",
  "builder",
  "ai",
  "plantillas",
  "biblioteca",
  "automatizaciones",
  "analytics",
  "marketplace",
  "conexiones",
  "configuracion",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** Calendar sub-views. */
export const CALENDAR_VIEWS = ["mes", "semana", "dia", "agenda", "kanban"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Media asset kinds. */
export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
