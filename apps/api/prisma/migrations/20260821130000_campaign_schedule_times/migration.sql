-- Multiple send times per day for campaigns + per-slot dedupe.
ALTER TABLE "Campaign" ADD COLUMN "scheduleTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "lastRunSlot" TEXT;
