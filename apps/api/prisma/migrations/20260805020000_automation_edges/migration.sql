-- Visual-editor connections for automations (Workflow Builder).
ALTER TABLE "Automation" ADD COLUMN "edges" JSONB NOT NULL DEFAULT '[]';
