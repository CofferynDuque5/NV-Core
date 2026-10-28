-- Group posting rules: kept-out groups, category, requirements, country.
ALTER TABLE "Group" ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "category" TEXT;
ALTER TABLE "Group" ADD COLUMN "requiresPrice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "requiresImage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "forbidsAds" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "onlyAdmins" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "country" TEXT;
ALTER TABLE "Group" ADD COLUMN "ownerJid" TEXT;
ALTER TABLE "Group" ADD COLUMN "rulesCheckedAt" TIMESTAMP(3);

-- Campaign prices per currency ({{precio}}) and the footer switch.
ALTER TABLE "Campaign" ADD COLUMN "prices" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Campaign" ADD COLUMN "addFooter" BOOLEAN NOT NULL DEFAULT true;

-- Brand links shown in the footer of group messages.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "socialLinks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkspaceSettings" ADD COLUMN "website" TEXT;
