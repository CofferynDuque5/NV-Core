-- Triage labels for inbox conversations.
ALTER TABLE "Conversation" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
