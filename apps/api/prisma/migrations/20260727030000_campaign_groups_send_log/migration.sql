-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "remoteJid" TEXT,
ADD COLUMN     "synced" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "lastRunDay" TEXT,
ADD COLUMN     "message" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scheduleAt" TEXT,
ADD COLUMN     "scheduleDays" INTEGER[],
ADD COLUMN     "scheduleType" TEXT NOT NULL DEFAULT 'once',
ADD COLUMN     "socialFormat" TEXT;

-- CreateTable
CREATE TABLE "GroupVariable" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendLog" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "groupId" TEXT,
    "groupName" TEXT,
    "target" TEXT,
    "postId" TEXT,
    "format" TEXT,
    "preview" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupVariable_workspaceSlug_idx" ON "GroupVariable"("workspaceSlug");

-- CreateIndex
CREATE UNIQUE INDEX "GroupVariable_groupId_key_key" ON "GroupVariable"("groupId", "key");

-- CreateIndex
CREATE INDEX "CampaignTarget_groupId_idx" ON "CampaignTarget"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTarget_campaignId_groupId_key" ON "CampaignTarget"("campaignId", "groupId");

-- CreateIndex
CREATE INDEX "SendLog_workspaceSlug_idx" ON "SendLog"("workspaceSlug");

-- CreateIndex
CREATE INDEX "SendLog_campaignId_idx" ON "SendLog"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_workspaceSlug_remoteJid_key" ON "Group"("workspaceSlug", "remoteJid");

-- AddForeignKey
ALTER TABLE "GroupVariable" ADD CONSTRAINT "GroupVariable_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendLog" ADD CONSTRAINT "SendLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendLog" ADD CONSTRAINT "SendLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

