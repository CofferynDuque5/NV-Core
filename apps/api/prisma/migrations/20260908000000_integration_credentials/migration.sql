-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationCredential_workspaceSlug_idx" ON "IntegrationCredential"("workspaceSlug");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_workspaceSlug_provider_key" ON "IntegrationCredential"("workspaceSlug", "provider");
