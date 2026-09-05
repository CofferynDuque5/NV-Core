-- Rotate campaign attachments (one image per run) instead of always the first.
ALTER TABLE "Campaign" ADD COLUMN "rotateAttachments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "attachmentRotation" INTEGER NOT NULL DEFAULT 0;
