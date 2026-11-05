/**
 * Campaign sending hours (brand and per group) and per-group daily limits.
 * Times are «HH:MM» on the brand's clock. A window may cross midnight
 * (22:00–02:00). No window = any time.
 */

export interface SendHours {
  sendFrom?: string | null;
  sendUntil?: string | null;
}

export interface SendSettings extends SendHours {
  /** Default most campaign messages per group per day; null = no limit. */
  groupMaxPerDay?: number | null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHHMM(v: unknown): v is string {
  return typeof v === "string" && HHMM.test(v);
}

/** Minutes after midnight of «HH:MM», or null. */
export function hhmmMinutes(v: string | null | undefined): number | null {
  const m = v ? HHMM.exec(v) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The window that applies: the group's own when it has both ends, else the brand's. */
export function effectiveHours(group: SendHours, brand: SendHours): { from: string; until: string } | null {
  if (isHHMM(group.sendFrom) && isHHMM(group.sendUntil)) return { from: group.sendFrom, until: group.sendUntil };
  if (isHHMM(brand.sendFrom) && isHHMM(brand.sendUntil)) return { from: brand.sendFrom, until: brand.sendUntil };
  return null;
}

/** True when `minutes` (after local midnight) falls inside [from, until). */
export function inSendWindow(minutes: number, w: { from: string; until: string } | null): boolean {
  if (!w) return true;
  const a = hhmmMinutes(w.from)!;
  const b = hhmmMinutes(w.until)!;
  if (a === b) return true; // 08:00–08:00 = all day
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** Minutes to wait from `minutes` until the window opens (0 when open now). */
export function minutesUntilOpen(minutes: number, w: { from: string; until: string } | null): number {
  if (inSendWindow(minutes, w)) return 0;
  const a = hhmmMinutes(w!.from)!;
  return (a - minutes + 1440) % 1440;
}

/** «08:00 a 21:00» (or «todo el día»). */
export function sendHoursLabel(w: { from: string; until: string } | null): string {
  return w ? `${w.from} a ${w.until}` : "todo el día";
}
