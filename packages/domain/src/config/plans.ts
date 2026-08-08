/**
 * Subscription plans and their per-workspace limits. Two tiers: Free (limited)
 * and Pro (unlimited). Limits are `null` when unlimited. This is product config
 * (like the other catalogs) — the operator wires Stripe to the "pro" tier; a
 * workspace with an active subscription is Pro, otherwise Free.
 */

export type PlanId = "free" | "pro";

export interface PlanLimits {
  /** Max contacts per workspace (null = unlimited). */
  contacts: number | null;
  /** Max campaigns per workspace. */
  campaigns: number | null;
  /** Max team members per workspace. */
  teamMembers: number | null;
  /** Max AI calls per calendar month. */
  aiCallsPerMonth: number | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  limits: PlanLimits;
}

export const PLAN_IDS: PlanId[] = ["free", "pro"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    limits: { contacts: 100, campaigns: 3, teamMembers: 2, aiCallsPerMonth: 20 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    limits: { contacts: null, campaigns: null, teamMembers: null, aiCallsPerMonth: null },
  },
};

/** Resolve a plan by id, falling back to Free for anything unknown. */
export function getPlan(id: string | null | undefined): Plan {
  return (id && PLANS[id as PlanId]) || PLANS.free;
}
