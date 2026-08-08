import { HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PlanService } from "./plan.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";

function makeConfig(opts: { stripe?: boolean; defaultPlan?: "free" | "pro" }) {
  return {
    get: vi.fn((key: string) => {
      if (key === "integrations") return { stripe: { secretKey: opts.stripe ? "sk_test" : undefined } };
      if (key === "billing") return { defaultPlan: opts.defaultPlan ?? "pro" };
      return {};
    }),
  } as unknown as ConfigService<AppConfig, true>;
}

function makePrisma(opts: {
  subscriptionStatus?: string | null;
  contacts?: number;
  campaigns?: number;
  members?: number;
  aiCalls?: number;
} = {}) {
  return {
    enabled: true,
    billingAccount: {
      findUnique: vi.fn(async () => ({ subscriptionStatus: opts.subscriptionStatus ?? null })),
    },
    contact: { count: vi.fn(async () => opts.contacts ?? 0) },
    campaign: { count: vi.fn(async () => opts.campaigns ?? 0) },
    membership: { count: vi.fn(async () => opts.members ?? 0) },
    aiUsage: { findUnique: vi.fn(async () => ({ calls: opts.aiCalls ?? 0 })) },
  } as unknown as PrismaService;
}

describe("PlanService.resolvePlanId", () => {
  it("uses the default plan when Stripe isn't configured (self-host → pro)", async () => {
    const svc = new PlanService(makePrisma(), makeConfig({ stripe: false, defaultPlan: "pro" }));
    expect(await svc.resolvePlanId("w1")).toBe("pro");
  });

  it("honors DEFAULT_PLAN=free when Stripe isn't configured", async () => {
    const svc = new PlanService(makePrisma(), makeConfig({ stripe: false, defaultPlan: "free" }));
    expect(await svc.resolvePlanId("w1")).toBe("free");
  });

  it("is free with Stripe configured but no active subscription", async () => {
    const svc = new PlanService(makePrisma({ subscriptionStatus: null }), makeConfig({ stripe: true }));
    expect(await svc.resolvePlanId("w1")).toBe("free");
  });

  it("is pro with an active subscription", async () => {
    const svc = new PlanService(makePrisma({ subscriptionStatus: "active" }), makeConfig({ stripe: true }));
    expect(await svc.resolvePlanId("w1")).toBe("pro");
  });

  it("treats trialing as pro and past_due as free", async () => {
    const trial = new PlanService(makePrisma({ subscriptionStatus: "trialing" }), makeConfig({ stripe: true }));
    const pastDue = new PlanService(makePrisma({ subscriptionStatus: "past_due" }), makeConfig({ stripe: true }));
    expect(await trial.resolvePlanId("w1")).toBe("pro");
    expect(await pastDue.resolvePlanId("w1")).toBe("free");
  });
});

describe("PlanService.assertWithinLimit", () => {
  it("allows creation below the Free limit", async () => {
    // Free contacts limit = 100; currently 99.
    const svc = new PlanService(makePrisma({ subscriptionStatus: null, contacts: 99 }), makeConfig({ stripe: true }));
    await expect(svc.assertWithinLimit("w1", "contacts", 1)).resolves.toBeUndefined();
  });

  it("throws 402 when creation would exceed the Free limit", async () => {
    const svc = new PlanService(makePrisma({ subscriptionStatus: null, contacts: 100 }), makeConfig({ stripe: true }));
    try {
      await svc.assertWithinLimit("w1", "contacts", 1);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    }
  });

  it("respects the count for bulk imports", async () => {
    // 90 existing + importing 20 = 110 > 100 → reject.
    const svc = new PlanService(makePrisma({ subscriptionStatus: null, contacts: 90 }), makeConfig({ stripe: true }));
    await expect(svc.assertWithinLimit("w1", "contacts", 20)).rejects.toBeInstanceOf(HttpException);
  });

  it("never blocks on Pro (unlimited)", async () => {
    const svc = new PlanService(makePrisma({ subscriptionStatus: "active", contacts: 10_000 }), makeConfig({ stripe: true }));
    await expect(svc.assertWithinLimit("w1", "contacts", 5000)).resolves.toBeUndefined();
  });

  it("reports usage counts", async () => {
    const svc = new PlanService(
      makePrisma({ contacts: 3, campaigns: 1, members: 2, aiCalls: 7 }),
      makeConfig({ stripe: false }),
    );
    expect(await svc.usage("w1")).toEqual({ contacts: 3, campaigns: 1, teamMembers: 2, aiCalls: 7 });
  });
});
