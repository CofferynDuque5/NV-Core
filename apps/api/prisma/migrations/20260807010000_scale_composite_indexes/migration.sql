-- Composite indexes for the dominant query shape: filter by tenant, order by
-- time. Turns "scan the whole workspace table then sort" into an index range
-- scan as tenants grow. Additive only — no data change.

CREATE INDEX IF NOT EXISTS "Conversation_workspaceSlug_createdAt_idx" ON "Conversation" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message" ("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Post_workspaceSlug_scheduledAt_idx" ON "Post" ("workspaceSlug", "scheduledAt");
CREATE INDEX IF NOT EXISTS "SendLog_workspaceSlug_createdAt_idx" ON "SendLog" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_workspaceSlug_createdAt_idx" ON "Notification" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Campaign_workspaceSlug_createdAt_idx" ON "Campaign" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Contact_workspaceSlug_createdAt_idx" ON "Contact" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_workspaceSlug_date_idx" ON "CalendarEvent" ("workspaceSlug", "date");
CREATE INDEX IF NOT EXISTS "MediaAsset_workspaceSlug_createdAt_idx" ON "MediaAsset" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Template_workspaceSlug_createdAt_idx" ON "Template" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Segment_workspaceSlug_createdAt_idx" ON "Segment" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Design_workspaceSlug_updatedAt_idx" ON "Design" ("workspaceSlug", "updatedAt");
CREATE INDEX IF NOT EXISTS "Group_workspaceSlug_createdAt_idx" ON "Group" ("workspaceSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_workspaceSlug_createdAt_idx" ON "AuditLog" ("workspaceSlug", "createdAt");
