-- Group destination kind: "group" (chat) or "channel" (broadcast, e.g. Telegram channel).
ALTER TABLE "Group" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'group';
