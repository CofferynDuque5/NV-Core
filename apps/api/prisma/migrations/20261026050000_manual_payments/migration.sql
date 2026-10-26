-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "contactId" TEXT,
    "methodId" TEXT,
    "methodLabel" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "rejectReason" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethod_workspaceSlug_idx" ON "PaymentMethod"("workspaceSlug");

-- CreateIndex
CREATE INDEX "PaymentRequest_workspaceSlug_status_createdAt_idx" ON "PaymentRequest"("workspaceSlug", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRequest_workspaceSlug_contactId_idx" ON "PaymentRequest"("workspaceSlug", "contactId");
