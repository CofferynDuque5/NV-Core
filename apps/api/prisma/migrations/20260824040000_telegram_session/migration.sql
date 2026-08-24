-- Telegram user (MTProto) session state per workspace.
CREATE TABLE "TelegramSession" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "username" TEXT,
    "phone" TEXT,
    "lastConnectionAt" TIMESTAMP(3),
    "groupsCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramSession_workspaceSlug_key" ON "TelegramSession"("workspaceSlug");
