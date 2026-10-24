import { describe, expect, it, vi } from "vitest";

import { PostScheduler, UNCONFIRMED_PUBLISH } from "./post-scheduler.service";

type AnyRec = Record<string, unknown>;

const CHANNEL_TO_PROVIDER: Record<string, string> = { fb: "facebook", ig: "instagram", wa: "whatsapp" };

function matches(row: AnyRec, where: AnyRec): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as AnyRec[]).some((w) => matches(row, w));
    if (v && typeof v === "object" && !(v instanceof Date) && "lte" in (v as AnyRec)) {
      const at = row[k] as Date | null | undefined;
      return !!at && at.getTime() <= ((v as AnyRec).lte as Date).getTime();
    }
    return row[k] === v;
  });
}

function make(
  opts: {
    queueEnabled?: boolean;
    posts?: AnyRec[];
    publish?: (ws: string, provider: string, input: AnyRec) => Promise<AnyRec>;
  } = {},
) {
  const posts = (opts.posts ?? []).map((p) => ({ ...p }));
  const enqueued: AnyRec[] = [];
  const removed: string[] = [];
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
      findUnique: vi.fn(async ({ where }: { where: AnyRec }) => posts.find((p) => p.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: AnyRec }) => posts.filter((p) => matches(p, where))),
      updateMany: vi.fn(async ({ where, data }: { where: AnyRec; data: AnyRec }) => {
        const hit = posts.filter((p) => matches(p, where));
        hit.forEach((p) => Object.assign(p, data));
        return { count: hit.length };
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
  const providers = {
    providerForChannel: (c: string) => CHANNEL_TO_PROVIDER[c],
    publish: vi.fn(opts.publish ?? (async () => ({ ok: true, id: "fb_1" }))),
  };
  const scheduler = new PostScheduler(queue as never, prisma as never, audit as never, providers as never);
  return { scheduler, queue, prisma, audit, providers, posts, enqueued, removed, notifications };
}

const due = (over: AnyRec = {}): AnyRec => ({
  id: "p1",
  workspaceSlug: "w1",
  title: "Lanzamiento",
  channel: "fb",
  copy: "Nuevo producto",
  hashtags: ["oferta", "#nv"],
  attachments: [{ url: "https://cdn/x.jpg", kind: "image", mime: "image/jpeg" }, { path: "local-only" }],
  status: "scheduled",
  scheduledAt: new Date(Date.now() - 60_000),
  publishStartedAt: null,
  ...over,
});

describe("PostScheduler.schedule", () => {
  it("enqueues with a positive delay when the queue is enabled", async () => {
    const { scheduler, enqueued } = make({ queueEnabled: true });
    const ok = await scheduler.schedule("p1", new Date(Date.now() + 60_000));
    expect(ok).toBe(true);
    expect(enqueued[0]!.jobId).toBe("post-p1");
    expect(enqueued[0]!.delayMs as number).toBeGreaterThan(0);
  });

  it("returns false without enqueuing when the queue is disabled (no Redis)", async () => {
    const { scheduler, enqueued } = make({ queueEnabled: false });
    expect(await scheduler.schedule("p1", new Date(Date.now() + 60_000))).toBe(false);
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

describe("PostScheduler.publish", () => {
  it("publishes through the channel's provider and only then marks it sent", async () => {
    const { scheduler, queue, providers, posts, notifications, audit } = make({ posts: [due()] });
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    const processor = queue.register.mock.calls[0]![1] as (p: AnyRec) => Promise<void>;
    await processor({ postId: "p1" });

    expect(providers.publish).toHaveBeenCalledWith("w1", "facebook", {
      message: "Nuevo producto\n\n#oferta #nv",
      attachments: [{ url: "https://cdn/x.jpg", kind: "image", mime: "image/jpeg", filename: null }],
    });
    expect(posts[0]!.status).toBe("sent");
    expect(notifications[0]).toMatchObject({ workspaceSlug: "w1", type: "success" });
    expect(audit.record).toHaveBeenCalledWith("w1", "system", "post.published", "p1");
  });

  it("marks the post as error (not sent) when the provider rejects it", async () => {
    const { scheduler, posts, notifications, audit } = make({
      posts: [due()],
      publish: async () => ({ ok: false, error: "Token de Meta vencido." }),
    });
    expect(await scheduler.publish("p1")).toBe(true);
    expect(posts[0]!.status).toBe("error");
    expect(notifications[0]).toMatchObject({ type: "error", meta: "Token de Meta vencido." });
    expect(audit.record).toHaveBeenCalledWith("w1", "system", "post.publish_failed", "p1");
  });

  it("marks the post as error when the adapter throws (e.g. unsupported)", async () => {
    const { scheduler, posts, notifications } = make({
      posts: [due({ channel: "wa" })],
      publish: async () => {
        throw new Error('El adapter "baileys" no soporta "publish".');
      },
    });
    await scheduler.publish("p1");
    expect(posts[0]!.status).toBe("error");
    expect(notifications[0]!.meta).toContain("no soporta");
  });

  it("fails clearly for a channel with no integration, without calling any provider", async () => {
    const { scheduler, providers, posts, notifications } = make({ posts: [due({ channel: "x" })] });
    await scheduler.publish("p1");
    expect(providers.publish).not.toHaveBeenCalled();
    expect(posts[0]!.status).toBe("error");
    expect(notifications[0]!.meta).toContain("no tiene una integración");
  });

  it("says when the post was only handed to the PC agent", async () => {
    const { scheduler, notifications } = make({
      posts: [due()],
      publish: async () => ({ ok: true, id: "agente:42" }),
    });
    await scheduler.publish("p1");
    expect(notifications[0]!.title).toContain("Agente PC");
  });

  it("is idempotent: a post that is not scheduled is never published", async () => {
    for (const status of ["sent", "publishing", "draft", "error"]) {
      const { scheduler, providers, notifications } = make({ posts: [due({ status })] });
      expect(await scheduler.publish("p1")).toBe(false);
      expect(providers.publish).not.toHaveBeenCalled();
      expect(notifications).toHaveLength(0);
    }
  });

  it("publishes once when the queue job and the sweep race for the same post", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { scheduler, providers, posts } = make({
      posts: [due()],
      publish: async () => {
        await gate;
        return { ok: true, id: "fb_1" };
      },
    });
    const a = scheduler.publish("p1");
    const b = scheduler.sweep();
    release();
    await Promise.all([a, b]);
    expect(providers.publish).toHaveBeenCalledTimes(1);
    expect(posts[0]!.status).toBe("sent");
  });
});

describe("PostScheduler.sweep (no Redis on cPanel)", () => {
  it("publishes due posts and leaves future ones scheduled", async () => {
    const { scheduler, providers, posts } = make({
      queueEnabled: false,
      posts: [due({ id: "a" }), due({ id: "b", scheduledAt: new Date(Date.now() + 3_600_000) })],
    });
    expect(await scheduler.sweep()).toBe(1);
    expect(providers.publish).toHaveBeenCalledTimes(1);
    expect(posts.find((p) => p.id === "a")!.status).toBe("sent");
    expect(posts.find((p) => p.id === "b")!.status).toBe("scheduled");
  });

  it("marks a publish interrupted by a restart as unconfirmed error, without re-publishing", async () => {
    const old = new Date(Date.now() - 20 * 60_000);
    const { scheduler, providers, posts, notifications } = make({
      posts: [due({ status: "publishing", publishStartedAt: old })],
    });
    await scheduler.sweep();
    expect(providers.publish).not.toHaveBeenCalled();
    expect(posts[0]!.status).toBe("error");
    expect(notifications[0]).toMatchObject({ type: "warning", meta: UNCONFIRMED_PUBLISH });
  });

  it("leaves a publish that is still in flight alone", async () => {
    const { scheduler, posts, notifications } = make({
      posts: [due({ status: "publishing", publishStartedAt: new Date() })],
    });
    await scheduler.sweep();
    expect(posts[0]!.status).toBe("publishing");
    expect(notifications).toHaveLength(0);
  });
});
