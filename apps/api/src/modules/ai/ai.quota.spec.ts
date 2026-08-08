import { describe, expect, it, vi } from "vitest";
import { getPlan, PLANS } from "@nv/domain";

import { AiService, effectiveAiQuota } from "./ai.module";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import type { PlanService } from "../../common/plan/plan.service";

describe("effectiveAiQuota", () => {
  it("uses the plan limit when there is no operator override", () => {
    expect(effectiveAiQuota(20, null)).toBe(20);
  });

  it("is unlimited when the plan is unlimited and no override", () => {
    expect(effectiveAiQuota(null, null)).toBeNull();
  });

  it("caps an unlimited plan with the operator override", () => {
    // Pro (unlimited) on a self-host with AI_MONTHLY_QUOTA=500 → 500.
    expect(effectiveAiQuota(null, 500)).toBe(500);
  });

  it("takes the smaller of plan vs override", () => {
    expect(effectiveAiQuota(20, 500)).toBe(20);
    expect(effectiveAiQuota(1000, 500)).toBe(500);
  });

  it("ignores non-positive overrides", () => {
    expect(effectiveAiQuota(20, 0)).toBe(20);
  });
});

function makeService(opts: {
  planId?: "free" | "pro";
  envQuota?: number;
  calls?: number;
}) {
  const config = {
    get: vi.fn(() => ({ ai: { monthlyQuota: opts.envQuota } })),
  } as unknown as ConfigService<AppConfig, true>;
  const prisma = {
    enabled: true,
    aiUsage: {
      findUnique: vi.fn(async () => ({ calls: opts.calls ?? 0, tokens: 123 })),
    },
  } as unknown as PrismaService;
  const plans = {
    resolvePlan: vi.fn(async () => getPlan(opts.planId ?? "free")),
  } as unknown as PlanService;
  return new AiService(config, prisma, plans);
}

describe("AiService.usage (plan-tiered quota)", () => {
  it("reports the Free plan quota (20) and plan identity", async () => {
    const svc = makeService({ planId: "free", calls: 5 });
    const u = await svc.usage("w1");
    expect(u.quota).toBe(PLANS.free.limits.aiCallsPerMonth); // 20
    expect(u.planId).toBe("free");
    expect(u.planName).toBe(PLANS.free.name);
    expect(u.calls).toBe(5);
  });

  it("reports unlimited (null) for Pro", async () => {
    const svc = makeService({ planId: "pro" });
    const u = await svc.usage("w1");
    expect(u.quota).toBeNull();
    expect(u.planId).toBe("pro");
  });

  it("caps the Pro quota with an operator override", async () => {
    const svc = makeService({ planId: "pro", envQuota: 500 });
    const u = await svc.usage("w1");
    expect(u.quota).toBe(500);
  });
});
