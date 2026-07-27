-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "number" TEXT,
    "lastConnectionAt" TIMESTAMP(3),
    "groupsCount" INTEGER NOT NULL DEFAULT 0,
    "contactsCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_workspaceSlug_key" ON "WhatsappSession"("workspaceSlug");
