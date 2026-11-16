-- Campaign categories (user-made groups on the Campañas page)
ALTER TABLE "Campaign" ADD COLUMN "category" TEXT;

-- Inbox unread state
ALTER TABLE "Conversation" ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- Open chats whose last message came from the customer start as unread.
UPDATE "Conversation" c
SET "unreadCount" = 1
WHERE c."resolved" = false
  AND (
    SELECT m."direction" FROM "Message" m
    WHERE m."conversationId" = c."id"
    ORDER BY m."createdAt" DESC
    LIMIT 1
  ) = 'in';

-- Shareable team invite links
CREATE TABLE "InviteLink" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Visor',
    "createdByName" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteLink_tokenHash_key" ON "InviteLink"("tokenHash");
CREATE INDEX "InviteLink_workspaceSlug_idx" ON "InviteLink"("workspaceSlug");
