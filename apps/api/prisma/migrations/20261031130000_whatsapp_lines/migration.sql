-- Several WhatsApp numbers per brand: line 1 is the existing main number.
DROP INDEX "WhatsappSession_workspaceSlug_key";
ALTER TABLE "WhatsappSession" ADD COLUMN "line" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WhatsappSession" ADD COLUMN "label" TEXT;
CREATE UNIQUE INDEX "WhatsappSession_workspaceSlug_line_key" ON "WhatsappSession"("workspaceSlug", "line");

-- The number that is in each group (existing groups belong to the main number)
ALTER TABLE "Group" ADD COLUMN "waLine" INTEGER NOT NULL DEFAULT 1;

-- The number each chat came in on (replies go out from it)
ALTER TABLE "Conversation" ADD COLUMN "waLine" INTEGER;
