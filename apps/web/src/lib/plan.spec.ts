import { describe, expect, it } from "vitest";
import type { AiUsage, PlanLimits, PlanUsage } from "@nv/domain";

import { aiQuotaState, isNearLimit, shouldPromptUpgrade, usagePct, usageRows } from "./plan";

const FREE_LIMITS: PlanLimits = { contacts: 100, campaigns: 3, teamMembers: 2, aiCallsPerMonth: 20 };
const PRO_LIMITS: PlanLimits = {
  contacts: null,
  campaigns: null,
  teamMembers: null,
  aiCallsPerMonth: null,
};

describe("usagePct / isNearLimit", () => {
  it("computes a clamped percentage", () => {
    expect(usagePct(50, 100)).toBe(50);
    expect(usagePct(200, 100)).toBe(100); // clamped
    expect(usagePct(5, null)).toBe(0); // unlimited
  });
  it("flags near-limit at >=80% but not when exhausted", () => {
    expect(isNearLimit(80, 100)).toBe(true);
    expect(isNearLimit(79, 100)).toBe(false);
    expect(isNearLimit(100, 100)).toBe(false); // exhausted, not "near"
    expect(isNearLimit(5, null)).toBe(false); // unlimited
  });
});

describe("usageRows", () => {
  it("marks exhausted and near-limit resources for Free", () => {
    const usage: PlanUsage = { contacts: 100, campaigns: 2, teamMembers: 1, aiCalls: 3 };
    const rows = usageRows(FREE_LIMITS, usage);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.contacts!.exhausted).toBe(true);
    expect(byKey.campaigns!.nearLimit).toBe(false); // 2/3 = 66%
    expect(byKey.contacts!.pct).toBe(100);
  });

  it("treats Pro (null limits) as unlimited: never exhausted, 0%", () => {
    const usage: PlanUsage = { contacts: 9999, campaigns: 500, teamMembers: 40, aiCalls: 1000 };
    const rows = usageRows(PRO_LIMITS, usage);
    expect(rows.every((r) => !r.exhausted && r.pct === 0 && r.limit === null)).toBe(true);
  });
});

describe("shouldPromptUpgrade", () => {
  it("prompts a Free workspace that hit a cap", () => {
    expect(
      shouldPromptUpgrade({
        planId: "free",
        limits: FREE_LIMITS,
        usage: { contacts: 100, campaigns: 0, teamMembers: 1, aiCalls: 0 },
      }),
    ).toBe(true);
  });
  it("does not prompt a Free workspace with headroom", () => {
    expect(
      shouldPromptUpgrade({
        planId: "free",
        limits: FREE_LIMITS,
        usage: { contacts: 10, campaigns: 0, teamMembers: 1, aiCalls: 0 },
      }),
    ).toBe(false);
  });
  it("never prompts Pro", () => {
    expect(
      shouldPromptUpgrade({
        planId: "pro",
        limits: PRO_LIMITS,
        usage: { contacts: 99999, campaigns: 99, teamMembers: 99, aiCalls: 99999 },
      }),
    ).toBe(false);
  });
});

describe("aiQuotaState", () => {
  const base: AiUsage = { period: "2026-08", calls: 0, tokens: 0, quota: 20, planId: "free", planName: "Free" };
  it("meters a Free workspace and offers upgrade when at the cap", () => {
    const s = aiQuotaState({ ...base, calls: 20 });
    expect(s.metered).toBe(true);
    expect(s.exhausted).toBe(true);
    expect(s.canUpgrade).toBe(true);
    expect(s.pct).toBe(100);
  });
  it("is unmetered and never upgradeable for Pro (unlimited)", () => {
    const s = aiQuotaState({ ...base, quota: null, planId: "pro", planName: "Pro", calls: 500 });
    expect(s.metered).toBe(false);
    expect(s.canUpgrade).toBe(false);
    expect(s.exhausted).toBe(false);
  });
});
