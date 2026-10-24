-- Campaign run recovery: an in-flight run is identified by a key + heartbeat so
-- a run interrupted by a restart can be resumed, and each chat is claimed once
-- per run (unique index) so retries/resumes never deliver twice.
-- Additive only: existing rows keep NULLs (Postgres allows many NULLs in a
-- unique index, so historical send logs are unaffected).
ALTER TABLE "Campaign" ADD COLUMN "runKey" TEXT,
ADD COLUMN "runHeartbeatAt" TIMESTAMP(3);

ALTER TABLE "SendLog" ADD COLUMN "runKey" TEXT;

CREATE UNIQUE INDEX "SendLog_campaignId_groupId_runKey_key" ON "SendLog"("campaignId", "groupId", "runKey");
