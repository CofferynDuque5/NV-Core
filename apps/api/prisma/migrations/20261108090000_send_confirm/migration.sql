-- Notice before each scheduled campaign send, with «Confirmar» / «No enviar».
ALTER TABLE "Campaign" ADD COLUMN "confirmSlot" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "confirmState" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "confirmFor" TIMESTAMP(3);
ALTER TABLE "WorkspaceSettings" ADD COLUMN "sendConfirm" TEXT NOT NULL DEFAULT 'notify';
ALTER TABLE "WorkspaceSettings" ADD COLUMN "sendConfirmLeadMin" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Notification" ADD COLUMN "actions" JSONB;
