-- CreateTable
CREATE TABLE "WorkspaceAccess" (
    "workspaceSlug" TEXT NOT NULL,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "paidUntil" TIMESTAMP(3),
    "activatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAccess_pkey" PRIMARY KEY ("workspaceSlug")
);

-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN "forWorkspace" TEXT;

-- CreateIndex
CREATE INDEX "PaymentRequest_forWorkspace_createdAt_idx" ON "PaymentRequest"("forWorkspace", "createdAt");
