-- Lead-capture forms (opt-in): a public submission becomes a Contact.
CREATE TABLE "Form" (
  "id"             TEXT NOT NULL,
  "workspaceSlug"  TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "fields"         JSONB NOT NULL DEFAULT '[]',
  "tags"           TEXT[] DEFAULT ARRAY[]::TEXT[],
  "stage"          TEXT NOT NULL DEFAULT 'Lead',
  "submitLabel"    TEXT NOT NULL DEFAULT 'Enviar',
  "successMessage" TEXT NOT NULL DEFAULT '¡Gracias! Te contactaremos pronto.',
  "redirectUrl"    TEXT,
  "views"          INTEGER NOT NULL DEFAULT 0,
  "submissions"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Form_workspaceSlug_idx" ON "Form"("workspaceSlug");
CREATE INDEX "Form_workspaceSlug_createdAt_idx" ON "Form"("workspaceSlug", "createdAt");
