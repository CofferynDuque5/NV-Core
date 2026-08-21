-- Publish a campaign to the connected WhatsApp Status (Estados) via Baileys.
ALTER TABLE "Campaign" ADD COLUMN "postToWaStatus" BOOLEAN NOT NULL DEFAULT false;
