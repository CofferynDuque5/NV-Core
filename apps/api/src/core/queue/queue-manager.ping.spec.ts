import { afterEach, describe, expect, it, vi } from "vitest";

import { QueueManager } from "./queue-manager.service";

/** Build a QueueManager and inject a fake Redis connection (or none). */
function build(fakePing?: () => Promise<string>) {
  const config = { get: vi.fn(() => ({ url: undefined })) };
  const qm = new QueueManager(config as never); // onModuleInit not called → inline
  if (fakePing) {
    (qm as unknown as { connection: { ping: () => Promise<string> } }).connection = {
      ping: fakePing,
    };
  }
  return qm;
}

describe("QueueManager.ping", () => {
  afterEach(() => vi.useRealTimers());

  it("returns 'inline' when no Redis connection is configured", async () => {
    await expect(build().ping()).resolves.toBe("inline");
  });

  it("returns 'ok' when Redis answers PONG", async () => {
    await expect(build(async () => "PONG").ping()).resolves.toBe("ok");
  });

  it("returns 'down' when Redis answers something else", async () => {
    await expect(build(async () => "nope").ping()).resolves.toBe("down");
  });

  it("returns 'down' when the PING rejects", async () => {
    await expect(build(async () => Promise.reject(new Error("ECONNREFUSED"))).ping()).resolves.toBe(
      "down",
    );
  });

  it("returns 'down' (does not hang) when the PING never resolves", async () => {
    vi.useFakeTimers();
    // Simulates an unreachable Redis with maxRetriesPerRequest:null: ping never settles.
    const qm = build(() => new Promise<string>(() => {}));
    const pending = qm.ping();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe("down");
  });
});
