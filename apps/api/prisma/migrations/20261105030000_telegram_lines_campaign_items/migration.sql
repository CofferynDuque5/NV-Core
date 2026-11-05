-- Several Telegram accounts per brand (like WhatsApp numbers), the numbers a
-- campaign sends from, and per-product messages with their own text and image.

ALTER TABLE "TelegramSession" ADD COLUMN IF NOT EXISTS "line" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TelegramSession" ADD COLUMN IF NOT EXISTS "label" TEXT;
DROP INDEX IF EXISTS "TelegramSession_workspaceSlug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramSession_workspaceSlug_line_key" ON "TelegramSession"("workspaceSlug", "line");

ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "tgLine" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "tgLine" INTEGER;

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "waLines" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "tgLines" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "items" JSONB NOT NULL DEFAULT '[]';
