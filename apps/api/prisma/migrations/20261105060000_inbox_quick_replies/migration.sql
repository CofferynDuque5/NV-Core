-- Inbox saved replies per brand.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "quickReplies" JSONB NOT NULL DEFAULT '[]';
