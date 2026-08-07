import { describe, expect, it, vi } from "vitest";
import { CHANGELOG_ENTRIES } from "@nv/domain";

import { ChangelogService } from "./changelog.module";
import type { PrismaService } from "../../prisma/prisma.service";

function makeService(lastSeenAt: Date | null) {
  const upserts: unknown[] = [];
  const prisma = {
    enabled: true,
    changelogState: {
      findUnique: vi.fn(async () => (lastSeenAt ? { userId: "u1", lastSeenAt } : null)),
      upsert: vi.fn(async (args: unknown) => {
        upserts.push(args);
        return { userId: "u1", lastSeenAt: new Date() };
      }),
    },
  };
  const service = new ChangelogService(prisma as unknown as PrismaService);
  return { service, prisma, upserts };
}

describe("ChangelogService.status", () => {
  it("marks every entry unseen for a user who never opened it", async () => {
    const { service } = makeService(null);
    const s = await service.status("u1");
    expect(s.lastSeenAt).toBeNull();
    expect(s.unseenCount).toBe(CHANGELOG_ENTRIES.length);
  });

  it("reports zero unseen after seeing the newest entry", async () => {
    const newest = CHANGELOG_ENTRIES.reduce((m, e) => (e.date > m ? e.date : m), "0000-00-00");
    // Seen a moment after the newest entry's date.
    const { service } = makeService(new Date(new Date(newest).getTime() + 1000));
    const s = await service.status("u1");
    expect(s.unseenCount).toBe(0);
    expect(s.lastSeenAt).not.toBeNull();
  });

  it("counts only entries newer than last-seen", async () => {
    const sorted = [...CHANGELOG_ENTRIES].sort((a, b) => (a.date < b.date ? -1 : 1));
    // Seen exactly at the oldest entry's date → everything strictly newer is unseen.
    const oldest = sorted[0]!.date;
    const { service } = makeService(new Date(oldest));
    const s = await service.status("u1");
    const strictlyNewer = CHANGELOG_ENTRIES.filter(
      (e) => new Date(e.date).getTime() > new Date(oldest).getTime(),
    ).length;
    expect(s.unseenCount).toBe(strictlyNewer);
  });

  it("returns all-unseen when the DB is disabled", async () => {
    const service = new ChangelogService({ enabled: false } as unknown as PrismaService);
    const s = await service.status("u1");
    expect(s.unseenCount).toBe(CHANGELOG_ENTRIES.length);
  });
});

describe("ChangelogService.markSeen", () => {
  it("upserts the last-seen time and returns zero unseen", async () => {
    const { service, upserts } = makeService(null);
    const s = await service.markSeen("u1");
    expect(upserts).toHaveLength(1);
    expect(s.unseenCount).toBe(0);
    expect(s.lastSeenAt).not.toBeNull();
  });

  it("does not touch the DB when disabled", async () => {
    const service = new ChangelogService({ enabled: false } as unknown as PrismaService);
    const s = await service.markSeen("u1");
    expect(s.unseenCount).toBe(0);
  });
});
