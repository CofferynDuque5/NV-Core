import { describe, expect, it, vi } from "vitest";

import { PostScheduler } from "./post-scheduler.service";

type AnyRec = Record<string, unknown>;

function make(opts: { queueEnabled?: boolean; post?: AnyRec | null } = {}) {
  const enqueued: AnyRec[] = [];
  const removed: string[] = [];
  const postUpdates: AnyRec[] = [];
  const notifications: AnyRec[] = [];

  const queue = {
    enabled: opts.queueEnabled ?? true,
    register: vi.fn(),
    enqueue: vi.fn(async (type: string, payload: AnyRec, o: AnyRec) => {
      enqueued.push({ type, payload, ...o });
    }),
    remove: vi.fn(async (id: string) => {
      removed.push(id);
    }),
  };
  const prisma = {
    enabled: true,
    post: {
      findUnique: vi.fn(async () => opts.post ?? null),
      update: vi.fn(async ({ data }: { data: AnyRec }) => {
        postUpdates.push(data);
        return data;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: AnyRec }) => {
        notifications.push(data);
        return data;
      }),
    },
  };
  const audit = { record: vi.fn() };
  const scheduler = new PostScheduler(queue as never, prisma as never, audit as never);
  return { scheduler, queue, prisma, audit, enqueued, removed, postUpdates, notifications };
}

describe("PostScheduler.schedule", () => {
  it("enqueues with a positive delay when the queue is enabled", async () => {
    const { scheduler, enqueued } = make({ queueEnabled: true });
    const runAt = new Date(Date.now() + 60_000);
    const ok = await scheduler.schedule("p1", runAt);
    expect(ok).toBe(true);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.jobId).toBe("post-p1");
    expect(enqueued[0]!.delayMs as number).toBeGreaterThan(0);
  });

  it("returns false without enqueuing when the queue is disabled (no Redis)", async () => {
    const { scheduler, enqueued } = make({ queueEnabled: false });
    const ok = await scheduler.schedule("p1", new Date(Date.now() + 60_000));
    expect(ok).toBe(false);
    expect(enqueued).toHaveLength(0);
  });

  it("clamps a past runAt to a non-negative delay", async () => {
    const { scheduler, enqueued } = make({ queueEnabled: true });
    await scheduler.schedule("p1", new Date(Date.now() - 60_000));
    expect(enqueued[0]!.delayMs as number).toBeGreaterThanOrEqual(0);
  });
});

describe("PostScheduler.cancel", () => {
  it("removes the job by its deterministic id", async () => {
    const { scheduler, removed } = make();
    await scheduler.cancel("p1");
    expect(removed).toEqual(["post-p1"]);
  });
});

describe("PostScheduler.publish (via the registered processor)", () => {
  it("transitions a due post to sent and notifies", async () => {
    const { scheduler, queue, postUpdates, notifications, audit } = make({
      post: { id: "p1", workspaceSlug: "w1", title: "Lanzamiento", status: "scheduled" },
    });
    scheduler.onModuleInit();
    // Run the processor the scheduler registered on the queue.
    const processor = queue.register.mock.calls[0]![1] as (p: AnyRec) => Promise<void>;
    await processor({ postId: "p1" });

    expect(postUpdates).toEqual([{ status: "sent" }]);
    expect(notifications[0]).toMatchObject({ workspaceSlug: "w1", type: "success" });
    expect(audit.record).toHaveBeenCalledWith("w1", "system", "post.published", "p1");
  });

  it("is idempotent: an already-sent post is not re-published", async () => {
    const { scheduler, queue, postUpdates, notifications } = make({
      post: { id: "p1", workspaceSlug: "w1", title: "X", status: "sent" },
    });
    scheduler.onModuleInit();
    const processor = queue.register.mock.calls[0]![1] as (p: AnyRec) => Promise<void>;
    await processor({ postId: "p1" });

    expect(postUpdates).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});
