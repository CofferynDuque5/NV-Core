-- Media attachments on posts, for the unified content editor / preview.
ALTER TABLE "Post" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
