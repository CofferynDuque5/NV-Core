import { describe, expect, it, vi } from "vitest";

import { EventBus } from "./events/event-bus.service";
import { JobManager } from "./jobs/job-manager.service";
import { QueueManager } from "./queue/queue-manager.service";

/**
 * Load / stress suite for the async core (RC hardening #16).
 *
 * Exercises the QueueManager (inline mode), JobManager and EventBus under high
 * concurrency to catch throughput regressions, lost jobs, retry storms and
 * handler-isolation failures. Runs without Redis/Postgres so it is CI-portable;
 * the inline path is the same code that keeps the platform working when Redis
 * is absent, so stressing it is meaningful. Kept in the low-hundreds range so
 * the whole suite stays well under a couple of seconds.
 */

/** Build a JobManager in inline mode (no Redis, no DB), like job-manager.spec. */
function buildJobs() {
  const config = { get: vi.fn(() => ({ url: undefined })) };
  const queue = new QueueManager(config as never); // onModuleInit not called → inline
  const events = new EventBus();
  const prisma = { enabled: false } as never;
  const jobs = new JobManager(prisma, queue, events);
  return { jobs, queue, events };
}

/** Poll until `predicate()` is true or the deadline passes. */
async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("core under load (stress)", () => {
  it("QueueManager inline runs every enqueued job (500, high concurrency)", async () => {
    const config = { get: vi.fn(() => ({ url: undefined })) };
    const queue = new QueueManager(config as never);
    const N = 500;
    let ran = 0;
    const seen = new Set<number>();
    queue.register("stress.count", async (payload) => {
      ran++;
      seen.add((payload as { i: number }).i);
    });

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        queue.enqueue("stress.count", { i }, { jobId: `j${i}`, attempts: 1 }),
      ),
    );
    await waitFor(() => ran >= N);

    expect(ran).toBe(N); // no job dropped, no job double-run
    expect(seen.size).toBe(N); // every distinct payload processed exactly once
  });

  it("JobManager dispatches hundreds of jobs, each handler fires once", async () => {
    const { jobs } = buildJobs();
    const N = 300;
    const counts = new Map<string, number>();
    jobs.register("stress.job", async (payload) => {
      const key = (payload as { k: string }).k;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    await Promise.all(
      Array.from({ length: N }, (_, i) => jobs.dispatch("stress.job", "w1", { k: `k${i}` })),
    );
    await waitFor(() => counts.size >= N);

    expect(counts.size).toBe(N);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
  });

  it("survives a retry storm: 200 jobs each fail once then succeed", async () => {
    const { jobs } = buildJobs();
    const N = 200;
    const attemptsByKey = new Map<string, number>();
    let succeeded = 0;
    jobs.register("stress.retry", async (payload) => {
      const key = (payload as { k: string }).k;
      const n = (attemptsByKey.get(key) ?? 0) + 1;
      attemptsByKey.set(key, n);
      if (n < 2) throw new Error("transient");
      succeeded++;
    });

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        jobs.dispatch("stress.retry", "w1", { k: `k${i}` }, { maxAttempts: 3, backoffMs: 1 }),
      ),
    );
    await waitFor(() => succeeded >= N);

    expect(succeeded).toBe(N); // all recovered
    expect([...attemptsByKey.values()].every((n) => n === 2)).toBe(true); // one retry each
  });

  it("emits job.failed for every job that exhausts its attempts (100)", async () => {
    const { jobs, events } = buildJobs();
    const N = 100;
    const failedIds = new Set<string>();
    events.on("job.failed", (p) => {
      failedIds.add(p.jobId);
    });
    jobs.register("stress.fail", async () => {
      throw new Error("always");
    });

    await Promise.all(
      Array.from({ length: N }, () =>
        jobs.dispatch("stress.fail", "w1", {}, { maxAttempts: 1, backoffMs: 1 }),
      ),
    );
    await waitFor(() => failedIds.size >= N);

    expect(failedIds.size).toBe(N); // exactly one terminal failure per job, no duplicates
  });

  it("EventBus fans out to many subscribers under load with handler isolation", async () => {
    const bus = new EventBus();
    const SUBS = 20;
    const EMITS = 1_000;
    const received = new Array(SUBS).fill(0);

    for (let s = 0; s < SUBS; s++) {
      bus.on("post.published", () => {
        received[s]++;
        // Every 4th subscriber throws — must not affect the others (isolation).
        if (s % 4 === 0) throw new Error("boom");
      });
    }

    for (let e = 0; e < EMITS; e++) {
      bus.emit("post.published", { workspaceSlug: "w1", postId: `p${e}` });
    }
    await waitFor(() => received.every((c) => c >= EMITS));

    // No listener starved by a noisy neighbor; every event reached every sub.
    expect(received.every((c) => c === EMITS)).toBe(true);
  });

  it("handles a mixed workload (ok / retry / fail) without cross-talk", async () => {
    const { jobs, events } = buildJobs();
    const okKeys = new Set<string>();
    let failed = 0;
    events.on("job.failed", () => {
      failed++;
    });

    jobs.register("mix.ok", async (p) => {
      okKeys.add((p as { k: string }).k);
    });
    // Per-job attempt tracking (no shared counter) so each retry job fails
    // exactly once then recovers — isolation is the property under test.
    const retryAttempts = new Map<string, number>();
    const retrySucceeded = new Set<string>();
    jobs.register("mix.retry", async (p) => {
      const k = (p as { k: string }).k;
      const n = (retryAttempts.get(k) ?? 0) + 1;
      retryAttempts.set(k, n);
      if (n < 2) throw new Error("flaky");
      retrySucceeded.add(k);
    });
    jobs.register("mix.fail", async () => {
      throw new Error("nope");
    });

    const work: Promise<unknown>[] = [];
    let retryTotal = 0;
    for (let i = 0; i < 120; i++) {
      work.push(jobs.dispatch("mix.ok", "w1", { k: `ok${i}` }));
      if (i % 3 === 0) {
        retryTotal++;
        work.push(jobs.dispatch("mix.retry", "w1", { k: `r${i}` }, { maxAttempts: 3, backoffMs: 1 }));
      }
      if (i % 10 === 0)
        work.push(jobs.dispatch("mix.fail", "w1", {}, { maxAttempts: 1, backoffMs: 1 }));
    }
    await Promise.all(work);
    // 12 mix.fail jobs (i = 0,10,...,110) each terminally fail once; retry jobs
    // all recover, so they contribute zero to `failed`.
    await waitFor(() => okKeys.size >= 120 && retrySucceeded.size >= retryTotal && failed >= 12);

    expect(okKeys.size).toBe(120);
    expect(retrySucceeded.size).toBe(retryTotal); // every retry job recovered
    expect(failed).toBe(12); // only the always-fail jobs report terminal failure
  });
});
