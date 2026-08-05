-- CreateTable
CREATE TABLE "ProviderSelection" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSelection_workspaceSlug_provider_key" ON "ProviderSelection"("workspaceSlug", "provider");
