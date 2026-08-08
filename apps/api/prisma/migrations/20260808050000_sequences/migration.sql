-- Drip sequences / autoresponders + per-contact enrollment state machine.
CREATE TABLE "Sequence" (
  "id"            TEXT NOT NULL,
  "workspaceSlug" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'active',
  "steps"         JSONB NOT NULL DEFAULT '[]',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Sequence_workspaceSlug_idx" ON "Sequence"("workspaceSlug");
CREATE INDEX "Sequence_workspaceSlug_createdAt_idx" ON "Sequence"("workspaceSlug", "createdAt");

CREATE TABLE "SequenceEnrollment" (
  "id"            TEXT NOT NULL,
  "workspaceSlug" TEXT NOT NULL,
  "sequenceId"    TEXT NOT NULL,
  "contactId"     TEXT NOT NULL,
  "contactName"   TEXT NOT NULL,
  "stepIndex"     INTEGER NOT NULL DEFAULT 0,
  "status"        TEXT NOT NULL DEFAULT 'active',
  "nextRunAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SequenceEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_contactId_key" ON "SequenceEnrollment"("sequenceId", "contactId");
CREATE INDEX "SequenceEnrollment_status_nextRunAt_idx" ON "SequenceEnrollment"("status", "nextRunAt");
CREATE INDEX "SequenceEnrollment_sequenceId_idx" ON "SequenceEnrollment"("sequenceId");
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
