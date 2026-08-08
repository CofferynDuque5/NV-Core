-- Affiliate program: referral partners + tracked click/conversion events.
CREATE TABLE "Affiliate" (
  "id"            TEXT NOT NULL,
  "workspaceSlug" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  "commissionPct" INTEGER NOT NULL DEFAULT 20,
  "destinationUrl" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'active',
  "clicks"        INTEGER NOT NULL DEFAULT 0,
  "conversions"   INTEGER NOT NULL DEFAULT 0,
  "earnings"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");
CREATE INDEX "Affiliate_workspaceSlug_idx" ON "Affiliate"("workspaceSlug");
CREATE INDEX "Affiliate_workspaceSlug_createdAt_idx" ON "Affiliate"("workspaceSlug", "createdAt");

CREATE TABLE "AffiliateEvent" (
  "id"          TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "amount"      DOUBLE PRECISION,
  "commission"  DOUBLE PRECISION,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AffiliateEvent_affiliateId_createdAt_idx" ON "AffiliateEvent"("affiliateId", "createdAt");
ALTER TABLE "AffiliateEvent" ADD CONSTRAINT "AffiliateEvent_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
