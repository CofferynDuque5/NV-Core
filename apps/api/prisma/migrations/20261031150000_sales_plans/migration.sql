-- Plans Básico / Pro: the brand's paid plan and the plan each plan payment is for.
ALTER TABLE "WorkspaceAccess" ADD COLUMN "planId" TEXT;
ALTER TABLE "PaymentRequest" ADD COLUMN "planId" TEXT;
