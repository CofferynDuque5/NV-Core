import type { LeadSourceCount, WeeklyReport } from "@nv/domain";

/**
 * Pure helpers for the weekly report: week boundaries (Monday 00:00 UTC),
 * lead-source ranking and the notification text. Kept side-effect-free so the
 * calendar math is unit-testable.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
/** Named lead sources listed before the rest are summed as "otros". */
export const LEAD_SOURCES_TOP = 5;
/** Example rows kept per "needs attention" entry. */
export const ATTENTION_ITEMS = 5;

/** Monday 00:00 UTC of the week that contains `d`. */
export function weekStartOf(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS);
}

/** Monday 00:00 UTC of the last week that has fully ended at `now`. */
export function lastClosedWeek(now: Date): Date {
  return new Date(weekStartOf(now).getTime() - WEEK_MS);
}

/** YYYY-MM-DD (UTC). */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD that must be a Monday; null otherwise. */
export function parseWeekStart(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || dayKey(d) !== v) return null;
  return weekStartOf(d).getTime() === d.getTime() ? d : null;
}

/** Top sources by count; the rest summed as "otros"; untracked (null) last. */
export function rankLeadSources(rows: { source: string | null; n: number }[]): LeadSourceCount[] {
  const ranked = rows
    .map((r) => ({ source: r.source, count: Number(r.n) }))
    .sort((a, b) => b.count - a.count || String(a.source).localeCompare(String(b.source)));
  const named = ranked.filter((r) => r.source !== null);
  const out: LeadSourceCount[] = named.slice(0, LEAD_SOURCES_TOP);
  const rest = named.slice(LEAD_SOURCES_TOP).reduce((a, r) => a + r.count, 0);
  if (rest > 0) out.push({ source: "otros", count: rest });
  const untracked = ranked.find((r) => r.source === null);
  if (untracked) out.push(untracked);
  return out;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** "13 al 19 de oct." / "27 de oct. al 2 de nov." */
export function weekLabel(weekStart: string, weekEnd: string): string {
  const [, m1, d1] = weekStart.split("-").map(Number) as [number, number, number];
  const [, m2, d2] = weekEnd.split("-").map(Number) as [number, number, number];
  return m1 === m2
    ? `${d1} al ${d2} de ${MONTHS[m2 - 1]}.`
    : `${d1} de ${MONTHS[m1 - 1]}. al ${d2} de ${MONTHS[m2 - 1]}.`;
}

/** One line for the in-app notice: leads with the trend and what is pending. */
export function noticeMeta(report: Pick<WeeklyReport, "weekStart" | "weekEnd" | "metrics" | "attention">): string {
  const contacts = report.metrics.find((m) => m.key === "contacts");
  const parts = [`Semana del ${weekLabel(report.weekStart, report.weekEnd)}`];
  if (contacts) {
    const diff = contacts.value - contacts.previous;
    parts.push(`${contacts.value} contactos nuevos${diff === 0 ? "" : ` (${diff > 0 ? "+" : ""}${diff})`}`);
  }
  const pending = report.attention.reduce((a, x) => a + x.count, 0);
  parts.push(pending === 0 ? "nada pendiente" : `${pending} ${pending === 1 ? "asunto pendiente" : "asuntos pendientes"}`);
  return parts.join(" · ");
}
