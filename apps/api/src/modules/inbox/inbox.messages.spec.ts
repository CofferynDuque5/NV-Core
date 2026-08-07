import { describe, expect, it, vi } from "vitest";

import { InboxService } from "./inbox.module";
import { THREAD_CAP } from "../../common/query-limits";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * Guards the scale fix for a busy thread: messages() must fetch only the most
 * recent THREAD_CAP rows (DB-side `take`, newest first) and then restore
 * chronological order for display.
 */
function makeService(findMany: ReturnType<typeof vi.fn>) {
  const prisma = { enabled: true, message: { findMany } };
  return new InboxService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never);
}

const row = (id: string, createdAt: Date) => ({
  id,
  conversationId: "c1",
  direction: "in",
  text: id,
  createdAt,
});

describe("InboxService.messages (scale bound)", () => {
  it("caps at THREAD_CAP newest and returns them oldest→newest", async () => {
    // DB returns newest-first (orderBy desc); service should reverse to asc.
    const desc = [
      row("m3", new Date("2026-01-03")),
      row("m2", new Date("2026-01-02")),
      row("m1", new Date("2026-01-01")),
    ];
    const findMany = vi.fn(async (_args: { take?: number; orderBy?: { createdAt?: string } }) => desc);
    const service = makeService(findMany);

    const out = await service.messages("w1", "c1");

    expect(out.map((m) => m.id)).toEqual(["m1", "m2", "m3"]); // chronological
    const args = findMany.mock.calls[0]![0];
    expect(args.take).toBe(THREAD_CAP);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("returns [] when the database is not configured", async () => {
    const prisma = { enabled: false, message: { findMany: vi.fn() } };
    const service = new InboxService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(await service.messages("w1", "c1")).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
