-- CreateTable
CREATE TABLE "AutomationInactiveFire" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "lastContactAt" TIMESTAMP(3) NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationInactiveFire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationInactiveFire_automationId_contactId_key" ON "AutomationInactiveFire"("automationId", "contactId");

-- CreateIndex
CREATE INDEX "AutomationInactiveFire_workspaceSlug_idx" ON "AutomationInactiveFire"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Contact_workspaceSlug_lastContactAt_idx" ON "Contact"("workspaceSlug", "lastContactAt");

-- AddForeignKey
ALTER TABLE "AutomationInactiveFire" ADD CONSTRAINT "AutomationInactiveFire_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
