-- In-app feedback submissions per workspace.
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rating" INTEGER,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Feedback_workspaceSlug_createdAt_idx" ON "Feedback"("workspaceSlug", "createdAt");
