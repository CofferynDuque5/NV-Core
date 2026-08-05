import type { ChannelId, Post, PostStatus } from "@nv/domain";

/** Calendar view modes shipped in Slice 2 (timeline/agenda arrive in S3). */
export type CalendarView = "month" | "week" | "day";

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Local YYYY-MM-DD key (calendar cells are keyed by local day). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** HH:MM in 24h local time. */
export function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b);
}

/** Monday as the first day of the week (offset 0). */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  return r;
}

/** The 7 days (Mon→Sun) of the week containing `d`. */
export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6×7 = 42 cells (Mon-first) covering the month of `d`. */
export function monthMatrix(d: Date): Date[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Human range label for the toolbar, per view. */
export function rangeLabel(view: CalendarView, cursor: Date): string {
  if (view === "day") {
    return `${WEEKDAYS_ES[(cursor.getDay() + 6) % 7]} ${cursor.getDate()} ${MONTHS_ES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }
  if (view === "week") {
    const days = weekDays(cursor);
    const a = days[0]!;
    const b = days[6]!;
    const sameMonth = a.getMonth() === b.getMonth();
    return sameMonth
      ? `${a.getDate()}–${b.getDate()} ${MONTHS_ES[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()} ${MONTHS_ES[a.getMonth()]} – ${b.getDate()} ${MONTHS_ES[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${MONTHS_ES[cursor.getMonth()]} ${cursor.getFullYear()}`;
}

/** Step the cursor by one unit of the current view (dir = -1 | +1). */
export function step(view: CalendarView, cursor: Date, dir: number): Date {
  if (view === "month") return addMonths(cursor, dir);
  if (view === "week") return addDays(cursor, 7 * dir);
  return addDays(cursor, dir);
}

// ── Filtering + grouping ─────────────────────────────────────────────────────

export interface CalendarFilters {
  /** Empty set = all channels. */
  channels: ChannelId[];
  /** Empty set = all statuses. */
  statuses: PostStatus[];
  /** null = all campaigns. */
  campaignId: string | null;
}

export const EMPTY_FILTERS: CalendarFilters = { channels: [], statuses: [], campaignId: null };

export function filtersActive(f: CalendarFilters): number {
  return f.channels.length + f.statuses.length + (f.campaignId ? 1 : 0);
}

/** Only scheduled posts (those with a date) appear on the calendar grid. */
export function scheduledOnly(posts: Post[]): Post[] {
  return posts.filter((p) => Boolean(p.scheduledAt));
}

export function applyFilters(posts: Post[], f: CalendarFilters): Post[] {
  return posts.filter((p) => {
    if (f.channels.length && !f.channels.includes(p.channel)) return false;
    if (f.statuses.length && !f.statuses.includes(p.status)) return false;
    if (f.campaignId && p.campaignId !== f.campaignId) return false;
    return true;
  });
}

/** Group posts by local day key; each bucket sorted by time ascending. */
export function groupByDay(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const key = ymd(new Date(p.scheduledAt));
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1));
  }
  return map;
}

/** Count per channel for the summary rail. */
export function countByChannel(posts: Post[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of posts) out[p.channel] = (out[p.channel] ?? 0) + 1;
  return out;
}
