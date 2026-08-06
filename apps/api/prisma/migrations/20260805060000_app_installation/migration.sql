-- Marketplace app installations per workspace.
CREATE TABLE "AppInstallation" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppInstallation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppInstallation_workspaceSlug_appId_key" ON "AppInstallation"("workspaceSlug", "appId");
CREATE INDEX "AppInstallation_workspaceSlug_idx" ON "AppInstallation"("workspaceSlug");
