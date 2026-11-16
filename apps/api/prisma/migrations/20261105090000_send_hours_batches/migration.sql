-- Sending hours (brand and per group), per-group daily limit, campaign batches and deferred groups.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "sendFrom" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "sendUntil" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "groupMaxPerDay" INTEGER;
ALTER TABLE "Group" ADD COLUMN "sendFrom" TEXT;
ALTER TABLE "Group" ADD COLUMN "sendUntil" TEXT;
ALTER TABLE "Group" ADD COLUMN "maxPerDay" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "batchSize" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "batchPauseMin" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "pendingGroups" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "pendingAt" TIMESTAMP(3);
CREATE INDEX "Campaign_pendingAt_idx" ON "Campaign"("pendingAt");
