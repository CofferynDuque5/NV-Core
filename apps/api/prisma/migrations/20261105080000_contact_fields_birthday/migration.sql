-- Contact birthday + custom field values; brand-level custom field definitions.
ALTER TABLE "Contact" ADD COLUMN "birthday" TEXT;
ALTER TABLE "Contact" ADD COLUMN "custom" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "WorkspaceSettings" ADD COLUMN "contactFields" JSONB NOT NULL DEFAULT '[]';
