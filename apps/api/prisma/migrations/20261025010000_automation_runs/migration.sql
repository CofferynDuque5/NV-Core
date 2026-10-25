-- Automatizaciones: historial de ejecuciones reales (pasos, resultado y motivo).
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "contactHandle" TEXT NOT NULL,
    "contactName" TEXT,
    "status" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRun_automationId_startedAt_idx" ON "AutomationRun"("automationId", "startedAt");
CREATE INDEX "AutomationRun_startedAt_idx" ON "AutomationRun"("startedAt");

ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
