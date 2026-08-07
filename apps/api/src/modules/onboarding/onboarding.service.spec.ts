import { describe, expect, it, vi } from "vitest";

import { OnboardingService } from "./onboarding.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Counts {
  connections?: number;
  contacts?: number;
  groups?: number;
  posts?: number;
  published?: number;
}

/** Build a fake Prisma whose counts and dismissal row we control. */
function makeService(counts: Counts = {}, dismissed = false) {
  const state: { dismissedAt: Date | null } | null = dismissed ? { dismissedAt: new Date(0) } : null;
  const upserts: unknown[] = [];
  const prisma = {
    enabled: true,
    connection: { count: vi.fn(async () => counts.connections ?? 0) },
    contact: { count: vi.fn(async () => counts.contacts ?? 0) },
    group: { count: vi.fn(async () => counts.groups ?? 0) },
    post: {
      count: vi.fn(async (args: { where: { status?: string } }) =>
        args.where.status === "sent" ? (counts.published ?? 0) : (counts.posts ?? 0),
      ),
    },
    onboardingState: {
      findUnique: vi.fn(async () => state),
      upsert: vi.fn(async (args: unknown) => {
        upserts.push(args);
        return { dismissedAt: new Date(0) };
      }),
    },
  };
  const service = new OnboardingService(prisma as unknown as PrismaService);
  return { service, prisma, upserts };
}

describe("OnboardingService.status", () => {
  it("marks every step incomplete for a fresh workspace", async () => {
    const { service } = makeService();
    const s = await service.status("w1", "u1");
    expect(s.steps.map((x) => x.done)).toEqual([false, false, false, false]);
    expect(s.completed).toBe(0);
    expect(s.total).toBe(4);
    expect(s.allDone).toBe(false);
    expect(s.dismissed).toBe(false);
  });

  it("derives step completion from real counts", async () => {
    const { service } = makeService({ connections: 1, groups: 2, posts: 3, published: 0 });
    const s = await service.status("w1", "u1");
    const done = Object.fromEntries(s.steps.map((x) => [x.key, x.done]));
    expect(done).toEqual({ connect: true, audience: true, content: true, publish: false });
    expect(s.completed).toBe(3);
    expect(s.allDone).toBe(false);
  });

  it("counts audience via contacts OR groups", async () => {
    const { service } = makeService({ contacts: 5 });
    const s = await service.status("w1", "u1");
    expect(s.steps.find((x) => x.key === "audience")!.done).toBe(true);
  });

  it("is allDone only when a post was actually published", async () => {
    const { service } = makeService({ connections: 1, contacts: 1, posts: 4, published: 1 });
    const s = await service.status("w1", "u1");
    expect(s.allDone).toBe(true);
    expect(s.completed).toBe(4);
  });

  it("reflects the user's dismissal", async () => {
    const { service } = makeService({}, true);
    const s = await service.status("w1", "u1");
    expect(s.dismissed).toBe(true);
  });

  it("returns an all-false status when the DB is disabled", async () => {
    const prisma = { enabled: false };
    const service = new OnboardingService(prisma as unknown as PrismaService);
    const s = await service.status("w1", "u1");
    expect(s.completed).toBe(0);
    expect(s.dismissed).toBe(false);
  });
});

describe("OnboardingService.dismiss", () => {
  it("upserts the dismissal and returns dismissed status", async () => {
    const { service, upserts } = makeService({ connections: 1 }, true);
    const s = await service.dismiss("w1", "u1");
    expect(upserts).toHaveLength(1);
    expect(s.dismissed).toBe(true);
    expect(s.steps.find((x) => x.key === "connect")!.done).toBe(true);
  });

  it("does not touch the DB when disabled", async () => {
    const prisma = { enabled: false };
    const service = new OnboardingService(prisma as unknown as PrismaService);
    const s = await service.dismiss("w1", "u1");
    expect(s.dismissed).toBe(false);
  });
});
