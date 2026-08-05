-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_workspaceSlug_status_idx" ON "Job"("workspaceSlug", "status");

-- CreateIndex
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");
