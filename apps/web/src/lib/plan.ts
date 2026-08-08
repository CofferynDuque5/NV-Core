/**
 * Pure plan/usage helpers — no React, unit-tested. Turn a workspace's plan
 * limits + current usage into display rows and upgrade-prompt state.
 */
import type { AiUsage, BillingStatus, PlanLimits, PlanUsage } from "@nv/domain";

export interface UsageRow {
  key: keyof PlanLimits;
  label: string;
  used: number;
  /** `null` = unlimited. */
  limit: number | null;
  /** 0–100 (0 when unlimited). */
  pct: number;
  /** used >= limit (never true when unlimited). */
  exhausted: boolean;
  /** >= 80% of a finite limit (and not yet exhausted). */
  nearLimit: boolean;
}

const RESOURCE_LABELS: Record<keyof PlanLimits, string> = {
  contacts: "Contactos",
  campaigns: "Campañas",
  teamMembers: "Miembros del equipo",
  aiCallsPerMonth: "Llamadas de IA (mes)",
};

/** Clamp a used/limit pair to a 0–100 percentage; 0 when unlimited. */
export function usagePct(used: number, limit: number | null): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function isNearLimit(used: number, limit: number | null): boolean {
  if (limit == null || limit <= 0) return false;
  return used < limit && used / limit >= 0.8;
}

/** Build the ordered usage rows for a billing status (limits + usage). */
export function usageRows(limits: PlanLimits, usage: PlanUsage): UsageRow[] {
  const map: { key: keyof PlanLimits; used: number }[] = [
    { key: "contacts", used: usage.contacts },
    { key: "campaigns", used: usage.campaigns },
    { key: "teamMembers", used: usage.teamMembers },
    { key: "aiCallsPerMonth", used: usage.aiCalls },
  ];
  return map.map(({ key, used }) => {
    const limit = limits[key];
    return {
      key,
      label: RESOURCE_LABELS[key],
      used,
      limit,
      pct: usagePct(used, limit),
      exhausted: limit != null && used >= limit,
      nearLimit: isNearLimit(used, limit),
    };
  });
}

/** True when this workspace could benefit from upgrading (Free with any finite cap hit/near). */
export function shouldPromptUpgrade(status: Pick<BillingStatus, "planId" | "limits" | "usage">): boolean {
  if (status.planId !== "free") return false;
  return usageRows(status.limits, status.usage).some((r) => r.exhausted || r.nearLimit);
}

export interface AiQuotaState {
  /** Show the quota meter/prompt at all (finite quota). */
  metered: boolean;
  used: number;
  limit: number | null;
  pct: number;
  exhausted: boolean;
  nearLimit: boolean;
  /** Offer an upgrade CTA (Free tier with a finite quota). */
  canUpgrade: boolean;
}

/** Derive the AI Studio quota banner state from the AI usage payload. */
export function aiQuotaState(usage: AiUsage): AiQuotaState {
  const { calls, quota, planId } = usage;
  const metered = quota != null;
  return {
    metered,
    used: calls,
    limit: quota,
    pct: usagePct(calls, quota),
    exhausted: quota != null && calls >= quota,
    nearLimit: isNearLimit(calls, quota),
    canUpgrade: planId === "free" && quota != null,
  };
}
