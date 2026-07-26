/** Billing/metering period key for a date: `YYYY-MM` (UTC). Pure — unit tested. */
export function usagePeriod(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Rough token estimate (~4 chars/token) when the provider doesn't report usage. */
export function estimateTokens(...texts: string[]): number {
  const chars = texts.reduce((sum, t) => sum + (t?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}
