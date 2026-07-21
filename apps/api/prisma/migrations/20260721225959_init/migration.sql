-- CreateEnum
CREATE TYPE "ChannelId" AS ENUM ('wa', 'ig', 'fb', 'tk', 'tg', 'x', 'th', 'email');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('borrador', 'programada', 'activa', 'pausada', 'completada');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('draft', 'scheduled', 'publishing', 'sent', 'error');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ok', 'warn', 'down');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Owner', 'Admin', 'Editor', 'Visor');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Visor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "tags" TEXT[],
    "stage" TEXT NOT NULL DEFAULT 'Lead',
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ChannelId" NOT NULL DEFAULT 'wa',
    "members" INTEGER NOT NULL DEFAULT 0,
    "admins" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5B8DEF',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'borrador',
    "channels" "ChannelId"[],
    "progress" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "accent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "campaignId" TEXT,
    "channel" "ChannelId" NOT NULL,
    "title" TEXT NOT NULL,
    "copy" TEXT,
    "hashtags" TEXT[],
    "status" "PostStatus" NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "channel" "ChannelId" NOT NULL,
    "handle" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'down',
    "token" TEXT,
    "expiresAt" TIMESTAMP(3),
    "webhookStatus" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "folderId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tag" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pausado',
    "runs" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "channel" "ChannelId" NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "channel" "ChannelId" NOT NULL,
    "contactName" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "assignee" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "meta" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_workspaceSlug_idx" ON "Membership"("workspaceSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceSlug_key" ON "Membership"("userId", "workspaceSlug");

-- CreateIndex
CREATE INDEX "Contact_workspaceSlug_idx" ON "Contact"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Group_workspaceSlug_idx" ON "Group"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Segment_workspaceSlug_idx" ON "Segment"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Campaign_workspaceSlug_idx" ON "Campaign"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Post_workspaceSlug_idx" ON "Post"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Connection_workspaceSlug_idx" ON "Connection"("workspaceSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_workspaceSlug_channel_key" ON "Connection"("workspaceSlug", "channel");

-- CreateIndex
CREATE INDEX "MediaFolder_workspaceSlug_idx" ON "MediaFolder"("workspaceSlug");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceSlug_idx" ON "MediaAsset"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Template_workspaceSlug_idx" ON "Template"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Automation_workspaceSlug_idx" ON "Automation"("workspaceSlug");

-- CreateIndex
CREATE INDEX "CalendarEvent_workspaceSlug_idx" ON "CalendarEvent"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Conversation_workspaceSlug_idx" ON "Conversation"("workspaceSlug");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Notification_workspaceSlug_idx" ON "Notification"("workspaceSlug");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceSlug_idx" ON "AuditLog"("workspaceSlug");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
