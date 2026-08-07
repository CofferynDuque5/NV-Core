-- Per-user onboarding dismissal state per workspace.
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingState_workspaceSlug_userId_key" ON "OnboardingState"("workspaceSlug", "userId");
CREATE INDEX "OnboardingState_workspaceSlug_idx" ON "OnboardingState"("workspaceSlug");
