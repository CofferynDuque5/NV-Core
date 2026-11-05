-- Plan payments: payer details, private receipt, local amount (VES) and rate.
-- Trial: one campaign send, and one trial per device/account (TrialClaim).
-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN     "localAmount" DECIMAL(18,2),
ADD COLUMN     "localCurrency" TEXT,
ADD COLUMN     "payer" JSONB,
ADD COLUMN     "rate" DECIMAL(18,4),
ADD COLUMN     "receiptFile" TEXT,
ADD COLUMN     "receiptType" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceAccess" ADD COLUMN     "trialDenied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialSendAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "brandSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT,
    "fingerprintHash" TEXT,
    "ip" TEXT,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialClaim_userId_idx" ON "TrialClaim"("userId");

-- CreateIndex
CREATE INDEX "TrialClaim_deviceHash_idx" ON "TrialClaim"("deviceHash");

-- CreateIndex
CREATE INDEX "TrialClaim_fingerprintHash_ip_idx" ON "TrialClaim"("fingerprintHash", "ip");

