import type { Campaign } from "@nv/domain";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Format a time as 12-hour with AM/PM. Accepts "HH:MM" (daily/weekly schedules)
 * or a full ISO datetime (one-off schedules). Returns the input unchanged if it
 * can't be parsed.
 */
export function formatTime12h(value: string): string {
  let h: number;
  let m: number;
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (hhmm) {
    h = Number(hhmm[1]);
    m = Number(hhmm[2]);
  } else {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    h = d.getHours();
    m = d.getMinutes();
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return value;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** The daily/weekly send times ("HH:MM"), from scheduleTimes or scheduleAt. */
function scheduleTimesOf(c: Campaign): string[] {
  if (c.scheduleTimes?.length) return c.scheduleTimes;
  return c.scheduleAt ? [c.scheduleAt] : [];
}

/** True when a campaign has a schedule and hasn't finished yet. */
export function isScheduled(c: Campaign): boolean {
  if (c.status === "completada") return false;
  return Boolean(c.scheduleAt) || (c.scheduleTimes?.length ?? 0) > 0;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  return `${d} de ${MONTHS[m - 1] ?? ""}.`;
}

/** "del 28 al 30 de oct." / "desde el 28 de oct." / "hasta el 30 de oct." ("" with no dates). */
export function dateRangeLabel(start?: string | null, end?: string | null): string {
  if (start && end) {
    const [, m1, d1] = start.split("-").map(Number) as [number, number, number];
    const [, m2] = end.split("-").map(Number) as [number, number, number];
    return m1 === m2 ? `del ${d1} al ${dayLabel(end)}` : `del ${dayLabel(start)} al ${dayLabel(end)}`;
  }
  if (start) return `desde el ${dayLabel(start)}`;
  if (end) return `hasta el ${dayLabel(end)}`;
  return "";
}

/** Human label of when a campaign will send, with AM/PM (supports varias horas). */
export function scheduleLabel(c: Campaign): string {
  const range = dateRangeLabel(c.startDate, c.endDate);
  const withRange = (label: string) => (range ? `${label} · ${range}` : label);
  if (c.scheduleType === "daily") {
    const times = scheduleTimesOf(c).map(formatTime12h).join(", ");
    return withRange(`Diario · ${times || "—"}`);
  }
  if (c.scheduleType === "weekly") {
    const days = (c.scheduleDays ?? []).map((d) => WEEKDAYS[d] ?? "").filter(Boolean).join(", ");
    const times = scheduleTimesOf(c).map(formatTime12h).join(", ");
    return withRange(`Semanal · ${days || "—"} · ${times || "—"}`);
  }
  // one-off: scheduleAt is an ISO datetime
  if (!c.scheduleAt) return "Sin programar";
  const d = new Date(c.scheduleAt);
  if (Number.isNaN(d.getTime())) return formatTime12h(c.scheduleAt);
  return `${d.toLocaleDateString("es-MX")} · ${formatTime12h(c.scheduleAt)}`;
}
