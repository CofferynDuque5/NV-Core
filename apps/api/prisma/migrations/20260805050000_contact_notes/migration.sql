-- CRM activity notes on contacts.
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactNote_workspaceSlug_contactId_idx" ON "ContactNote"("workspaceSlug", "contactId");
