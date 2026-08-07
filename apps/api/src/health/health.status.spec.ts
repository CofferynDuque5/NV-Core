import { describe, expect, it, vi } from "vitest";

import { HealthController } from "./health.module";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueManager } from "../core/queue/queue-manager.service";
import type { ConfigService } from "@nestjs/config";

function makeController(opts: {
  dbEnabled?: boolean;
  dbThrows?: boolean;
  redis?: "ok" | "inline" | "down";
}) {
  const prisma = {
    enabled: opts.dbEnabled ?? true,
    $queryRaw: vi.fn(async () => {
      if (opts.dbThrows) throw new Error("down");
      return [{ "?column?": 1 }];
    }),
  };
  const queue = { ping: vi.fn(async () => opts.redis ?? "ok") };
  const config = { get: vi.fn(() => "test") };
  return new HealthController(
    config as unknown as ConfigService<never, true>,
    prisma as unknown as PrismaService,
    queue as unknown as QueueManager,
  );
}

describe("HealthController.status", () => {
  it("reports operational when DB is up and Redis is connected", async () => {
    const s = await makeController({ redis: "ok" }).status();
    expect(s.overall).toBe("operational");
    expect(s.components.find((c) => c.key === "database")!.status).toBe("operational");
    expect(s.components.find((c) => c.key === "queue")!.status).toBe("operational");
  });

  it("treats inline queue mode as operational with a detail note", async () => {
    const s = await makeController({ redis: "inline" }).status();
    const queue = s.components.find((c) => c.key === "queue")!;
    expect(queue.status).toBe("operational");
    expect(queue.detail).toMatch(/inline/i);
    expect(s.overall).toBe("operational");
  });

  it("marks the system down when the database ping fails", async () => {
    const s = await makeController({ dbThrows: true }).status();
    expect(s.components.find((c) => c.key === "database")!.status).toBe("down");
    expect(s.overall).toBe("down");
  });

  it("marks the system down when Redis is down", async () => {
    const s = await makeController({ redis: "down" }).status();
    expect(s.components.find((c) => c.key === "queue")!.status).toBe("down");
    expect(s.overall).toBe("down");
  });

  it("degrades to unknown DB when not configured", async () => {
    const s = await makeController({ dbEnabled: false, redis: "inline" }).status();
    const db = s.components.find((c) => c.key === "database")!;
    expect(db.status).toBe("unknown");
    expect(db.detail).toMatch(/configurada/i);
    expect(s.overall).toBe("degraded");
  });

  it("always reports the API component as operational", async () => {
    const s = await makeController({}).status();
    expect(s.components.find((c) => c.key === "api")!.status).toBe("operational");
  });
});
