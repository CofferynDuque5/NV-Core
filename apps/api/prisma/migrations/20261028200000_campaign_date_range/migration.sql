-- «Desde / hasta» for daily and weekly campaigns ("YYYY-MM-DD", inclusive).
ALTER TABLE "Campaign" ADD COLUMN "startDate" TEXT,
ADD COLUMN "endDate" TEXT;
