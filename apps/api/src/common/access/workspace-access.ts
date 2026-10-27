import type { WorkspaceAccess } from "@nv/domain";

/**
 * Pure rules of the free trial (no DB, unit-tested). A brand without a row is
 * not on a trial at all (built-in or operator brand) and is never locked.
 */

export interface AccessRow {
  trialEndsAt: Date;
  paidUntil: Date | null;
}

export function accessState(row: AccessRow | null, now: Date): WorkspaceAccess {
  if (!row) return { state: "unlimited" };
  const base = {
    trialEndsAt: row.trialEndsAt.toISOString(),
    ...(row.paidUntil ? { paidUntil: row.paidUntil.toISOString() } : {}),
  };
  if (row.paidUntil && row.paidUntil > now) return { state: "active", ...base };
  if (row.trialEndsAt > now) return { state: "trial", ...base };
  return { state: "expired", ...base };
}

/** Paid time after confirming `days` more: added to what is left, or from now if it already ran out. */
export function extendPaidUntil(current: Date | null, days: number, now: Date): Date {
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * Brand routes that stay open after the trial so the customer can see their
 * status and pay: `/workspaces/:ws/access/...` and `/workspaces/:ws/billing/...`.
 */
export const OPEN_WHEN_EXPIRED = new Set(["access", "billing"]);

/** Section of a brand route ("contacts", "access"…), from its URL. */
export function routeSection(url: string, workspace: string): string | undefined {
  const path = url.split("?")[0] ?? "";
  const marker = `/workspaces/${workspace}/`;
  const at = path.indexOf(marker);
  if (at === -1) return undefined;
  return path.slice(at + marker.length).split("/")[0] || undefined;
}
