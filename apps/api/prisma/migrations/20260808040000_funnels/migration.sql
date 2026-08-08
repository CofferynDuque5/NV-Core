-- Multi-step funnels (opt-in → sales → thank-you). Steps stored as JSON.
CREATE TABLE "Funnel" (
  "id"            TEXT NOT NULL,
  "workspaceSlug" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "steps"         JSONB NOT NULL DEFAULT '[]',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Funnel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Funnel_workspaceSlug_idx" ON "Funnel"("workspaceSlug");
CREATE INDEX "Funnel_workspaceSlug_createdAt_idx" ON "Funnel"("workspaceSlug", "createdAt");
