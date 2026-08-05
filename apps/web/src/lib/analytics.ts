import type { AnalyticsPoint } from "@nv/domain";

/**
 * Pure analytics view helpers — no React, no side effects, unit-tested.
 * Keeps the Analytics page declarative and the tricky bits verifiable.
 */

export const WEEKDAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

const MONTHS_ES_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

/** "2026-08-05" → "5 ago" (compact axis label). */
export function shortDate(iso: string): string {
  const parts = iso.split("-");
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return iso;
  return `${day} ${MONTHS_ES_SHORT[month - 1] ?? ""}`.trim();
}

export interface SeriesDatum extends AnalyticsPoint {
  label: string;
}

/** Attach a short human label to each daily point for the time-series chart. */
export function toChartSeries(points: AnalyticsPoint[] | undefined): SeriesDatum[] {
  return (points ?? []).map((p) => ({ ...p, label: shortDate(p.date) }));
}

/** Sum a metric across the series (for "totals in period"). */
export function sumSeries(points: AnalyticsPoint[] | undefined, key: keyof AnalyticsPoint): number {
  if (!points) return 0;
  return points.reduce((acc, p) => acc + (typeof p[key] === "number" ? (p[key] as number) : 0), 0);
}

/** Largest single cell in a heatmap (used to scale intensity). */
export function heatmapMax(matrix: number[][]): number {
  let max = 0;
  for (const row of matrix) for (const v of row) if (v > max) max = v;
  return max;
}

/** Normalize a cell value to 0..1 relative to the matrix peak. */
export function heatIntensity(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, value / max);
}

export interface PeakSlot {
  day: number; // 0=Sun … 6=Sat
  hour: number; // 0..23
  value: number;
}

/** The busiest weekday/hour cell in the heatmap (0 value → no activity). */
export function peakSlot(matrix: number[][]): PeakSlot {
  let best: PeakSlot = { day: 0, hour: 0, value: 0 };
  for (let d = 0; d < matrix.length; d++) {
    const row = matrix[d] ?? [];
    for (let h = 0; h < row.length; h++) {
      if ((row[h] ?? 0) > best.value) best = { day: d, hour: h, value: row[h] ?? 0 };
    }
  }
  return best;
}

/** "Lun 15:00" style label for a peak slot (empty when there is no activity). */
export function peakLabel(slot: PeakSlot): string {
  if (slot.value <= 0) return "";
  return `${WEEKDAYS_ES[slot.day]} ${String(slot.hour).padStart(2, "0")}:00`;
}
