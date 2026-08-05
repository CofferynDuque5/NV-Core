import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../events/event-bus.service";
import { QueueManager } from "../queue/queue-manager.service";
import { JobManager } from "./job-manager.service";

/** Build a JobManager in inline mode (no Redis, no DB). */
function build() {
  const config = { get: vi.fn(() => ({ url: undefined })) };
  const queue = new QueueManager(config as never); // onModuleInit not called → inline
  const events = new EventBus();
  const prisma = { enabled: false } as never;
  const jobs = new JobManager(prisma, queue, events);
  return { jobs, events };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

describe("JobManager (inline)", () => {
  it("runs a registered handler", async () => {
    const { jobs } = build();
    const handler = vi.fn(async (_payload: unknown) => ({ done: true }));
    jobs.register("t.ok", handler);
    await jobs.dispatch("t.ok", "w1", { a: 1 });
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toEqual({ a: 1 });
  });

  it("retries until it succeeds", async () => {
    const { jobs } = build();
    let attempts = 0;
    jobs.register("t.retry", async () => {
      attempts++;
      if (attempts < 2) throw new Error("transient");
      return "ok";
    });
    await jobs.dispatch("t.retry", "w1", {}, { maxAttempts: 3, backoffMs: 1 });
    await flush();
    expect(attempts).toBe(2);
  });

  it("emits job.failed when attempts are exhausted", async () => {
    const { jobs, events } = build();
    const onFailed = vi.fn();
    events.on("job.failed", onFailed);
    jobs.register("t.fail", async () => {
      throw new Error("always");
    });
    await jobs.dispatch("t.fail", "w1", {}, { maxAttempts: 1, backoffMs: 1 });
    await flush();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0]![0]).toMatchObject({ type: "t.fail", error: "always" });
  });
});
