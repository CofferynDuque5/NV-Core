import { describe, expect, it, vi } from "vitest";

import { AffiliatesService } from "./affiliates.module";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditLogger } from "../../common/audit-logger.service";

function makeService(affiliate: Record<string, unknown> | null) {
  const prisma = {
    enabled: true,
    affiliate: {
      findFirst: vi.fn(async () => affiliate),
      findUnique: vi.fn(async () => affiliate),
      update: vi.fn(async ({ data }: { data: unknown }) => ({ ...affiliate, _updated: data })),
    },
    affiliateEvent: {
      create: vi.fn(async ({ data }: { data: unknown }) => data),
    },
    // $transaction resolves an array of prepared promises, in order.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: vi.fn(() => "https://app.nv.com") };
  const svc = new AffiliatesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditLogger,
    config as never,
  );
  return { svc, prisma };
}

const aff = {
  id: "a1",
  workspaceSlug: "w1",
  code: "ana-1a2b",
  commissionPct: 20,
  status: "active",
  destinationUrl: "https://landing.example.com",
  clicks: 0,
  conversions: 0,
  earnings: 0,
  createdAt: new Date("2026-08-08T00:00:00Z"),
};

describe("AffiliatesService.convert", () => {
  it("credits commission = amount × pct% and logs a conversion event", async () => {
    const { svc, prisma } = makeService(aff);
    await svc.convert("w1", "actor", "a1", 100);
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { conversions: { increment: 1 }, earnings: { increment: 20 } },
    });
    expect(prisma.affiliateEvent.create).toHaveBeenCalledWith({
      data: { affiliateId: "a1", type: "conversion", amount: 100, commission: 20 },
    });
  });
});

describe("AffiliatesService.trackClick", () => {
  it("counts the click and returns the destination for an active affiliate", async () => {
    const { svc, prisma } = makeService(aff);
    const url = await svc.trackClick("ana-1a2b");
    expect(url).toBe("https://landing.example.com");
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { clicks: { increment: 1 } },
    });
  });

  it("returns the app fallback for a paused or unknown code (no leak)", async () => {
    const paused = makeService({ ...aff, status: "paused" });
    expect(await paused.svc.trackClick("x")).toBe("https://app.nv.com");
    expect(paused.prisma.affiliate.update).not.toHaveBeenCalled();

    const missing = makeService(null);
    expect(await missing.svc.trackClick("nope")).toBe("https://app.nv.com");
  });
});
