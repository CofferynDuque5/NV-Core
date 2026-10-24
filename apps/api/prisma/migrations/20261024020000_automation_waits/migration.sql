-- Automatizaciones: esperas persistentes (el nodo «esperar» reanuda el flujo
-- más tarde, también tras un reinicio y sin Redis).
CREATE TABLE "AutomationWait" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "waitNodeId" TEXT NOT NULL,
    "nextNodeId" TEXT NOT NULL,
    "contactHandle" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "resumeAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationWait_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationWait_status_resumeAt_idx" ON "AutomationWait"("status", "resumeAt");
CREATE INDEX "AutomationWait_automationId_contactHandle_status_idx" ON "AutomationWait"("automationId", "contactHandle", "status");
CREATE INDEX "AutomationWait_workspaceSlug_idx" ON "AutomationWait"("workspaceSlug");

ALTER TABLE "AutomationWait" ADD CONSTRAINT "AutomationWait_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
