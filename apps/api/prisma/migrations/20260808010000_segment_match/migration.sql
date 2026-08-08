-- Add rule-combination mode to Segment (how rules combine: "all" = AND, "any" = OR).
ALTER TABLE "Segment" ADD COLUMN "match" TEXT NOT NULL DEFAULT 'all';
