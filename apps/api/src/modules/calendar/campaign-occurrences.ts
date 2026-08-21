import type { CalendarEvent, ChannelId } from "@nv/domain";

/** Minimal campaign shape needed to compute calendar occurrences. */
export interface SchedulableCampaign {
  id: string;
  name: string;
  status: string;
  channels: string[];
  scheduleType: string | null;
  scheduleAt: string | null;
  scheduleTimes: string[];
  scheduleDays: number[];
}

function parseHM(t: string): [number, number] | null {
  const [h, m] = String(t).split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : [h, m];
}

/**
 * Expand a scheduled campaign into calendar events within [gte, lt).
 * - "once": one event at its datetime (if inside the range).
 * - "daily": every day, at each of `scheduleTimes` (or `scheduleAt`).
 * - "weekly": on each configured weekday, at each time.
 * Paused/completed campaigns produce nothing. Guarded against runaway loops.
 */
export function campaignOccurrences(
  c: SchedulableCampaign,
  gte: Date,
  lt: Date,
): CalendarEvent[] {
  if (c.status === "pausada" || c.status === "completada") return [];
  const channel = (c.channels[0] as ChannelId) ?? "wa";
  const out: CalendarEvent[] = [];

  if (c.scheduleType === "once") {
    if (!c.scheduleAt) return out;
    const d = new Date(c.scheduleAt);
    if (!Number.isNaN(d.getTime()) && d >= gte && d < lt) {
      out.push({ id: `cmp-${c.id}-once`, date: d.toISOString(), channel, title: c.name, campaignId: c.id });
    }
    return out;
  }

  const times = c.scheduleTimes?.length ? c.scheduleTimes : c.scheduleAt ? [c.scheduleAt] : [];
  if (times.length === 0) return out;

  const day = new Date(Date.UTC(gte.getUTCFullYear(), gte.getUTCMonth(), gte.getUTCDate()));
  let guard = 0;
  while (day < lt && guard++ < 400) {
    const dow = day.getUTCDay();
    const matchesDay =
      c.scheduleType === "daily" || (c.scheduleType === "weekly" && c.scheduleDays.includes(dow));
    if (matchesDay) {
      for (const t of times) {
        const hm = parseHM(t);
        if (!hm) continue;
        const dt = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hm[0], hm[1]),
        );
        if (dt >= gte && dt < lt) {
          out.push({
            id: `cmp-${c.id}-${dt.toISOString()}`,
            date: dt.toISOString(),
            channel,
            title: c.name,
            campaignId: c.id,
          });
        }
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}
