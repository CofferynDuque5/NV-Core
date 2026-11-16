-- Who uses the panel: one row per visit (browser tab), kept 90 days.
CREATE TABLE "PanelSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "device" TEXT NOT NULL DEFAULT '—',
    "deviceKind" TEXT NOT NULL DEFAULT 'computadora',
    "workspaceSlug" TEXT,
    "lastPath" TEXT,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PanelSession_lastAt_idx" ON "PanelSession"("lastAt");
CREATE INDEX "PanelSession_userId_lastAt_idx" ON "PanelSession"("userId", "lastAt");
ALTER TABLE "PanelSession" ADD CONSTRAINT "PanelSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
