-- Per-user changelog last-seen state (product-wide, keyed by user).
CREATE TABLE "ChangelogState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangelogState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChangelogState_userId_key" ON "ChangelogState"("userId");
