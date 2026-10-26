-- Tasks can point at a CRM contact.
ALTER TABLE "Task" ADD COLUMN "contactId" TEXT;
CREATE INDEX "Task_workspaceSlug_contactId_idx" ON "Task"("workspaceSlug", "contactId");

-- Notifications addressed to a single member (null = whole workspace).
ALTER TABLE "Notification" ADD COLUMN "recipient" TEXT;
