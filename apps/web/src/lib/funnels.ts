import type { FunnelPage, FunnelStepType } from "@nv/domain";

/** Pure helpers for the funnels UI. */

export const STEP_TYPE_LABEL: Record<FunnelStepType, string> = {
  optin: "Opt-in",
  sales: "Venta",
  thankyou: "Gracias",
};

/** Total visits into the funnel (visits to the first step). */
export function funnelEntries(steps: FunnelPage[]): number {
  return steps[0]?.views ?? 0;
}

/**
 * End-to-end conversion: visitors that reached the last step vs. the first.
 * 0 when there are <2 steps or no entry traffic.
 */
export function funnelConversion(steps: FunnelPage[]): number {
  if (steps.length < 2) return 0;
  const first = steps[0]!.views;
  const last = steps[steps.length - 1]!.views;
  if (first <= 0) return 0;
  return Math.round((last / first) * 1000) / 10;
}

/** Public URL for a funnel (its entry step). */
export function publicFunnelUrl(origin: string, funnelId: string): string {
  return `${origin.replace(/\/$/, "")}/fn/${funnelId}`;
}
