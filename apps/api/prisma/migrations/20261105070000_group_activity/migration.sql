-- Group activity: last message seen in the group, and since when it is watched.
ALTER TABLE "Group" ADD COLUMN "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "Group" ADD COLUMN "watchedSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Last send per group (Grupos list).
CREATE INDEX "SendLog_groupId_createdAt_idx" ON "SendLog"("groupId", "createdAt");
