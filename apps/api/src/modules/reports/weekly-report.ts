import { PAYMENT_CURRENCIES, type LeadSourceCount, type PaymentCurrency, type WeeklyReport, type WeeklyReportInbox, type WeeklyReportPayments } from "@nv/domain";

/**
 * Pure helpers for the weekly report: week boundaries (Monday 00:00 in the
 * brand's time zone; a week is keyed by its calendar Monday as a UTC-midnight date),
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

/**
 * How far `tz` is ahead of UTC at `instant`, in ms (Bogotá → -5 h). Read from
 * Intl, so daylight saving is handled where a zone has it.
 */
export function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Calendar day (YYYY-MM-DD) that `instant` falls on in `tz`. */
export function localDayKey(instant: Date, tz: string): string {
  return dayKey(new Date(instant.getTime() + zoneOffsetMs(instant, tz)));
}

/** The instant a calendar day starts (00:00) in `tz`. */
export function zonedMidnight(day: string, tz: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00.000Z`).getTime();
  // Guess with the offset at UTC midnight, then correct once in case the
  // offset differs at the real local midnight (a DST change that day).
  let t = utcMidnight - zoneOffsetMs(new Date(utcMidnight), tz);
  t = utcMidnight - zoneOffsetMs(new Date(t), tz);
  return new Date(t);
}

/** Monday (as a UTC-midnight date key) of the week `instant` falls in, in `tz`. */
export function localWeekStart(instant: Date, tz: string): Date {
  return weekStartOf(new Date(`${localDayKey(instant, tz)}T00:00:00.000Z`));
}

/** Last week fully ended at `now` in `tz` (its Monday as a UTC-midnight key). */
export function lastClosedLocalWeek(now: Date, tz: string): Date {
  return new Date(localWeekStart(now, tz).getTime() - WEEK_MS);
}

/** Real instants a week covers in `tz`: its Monday 00:00 to the next Monday 00:00. */
export function weekBounds(weekStart: Date, tz: string): { from: Date; to: Date } {
  return {
    from: zonedMidnight(dayKey(weekStart), tz),
    to: zonedMidnight(dayKey(new Date(weekStart.getTime() + WEEK_MS)), tz),
  };
}

/** "dd/mm" of `instant` in `tz`. */
export function shortDay(instant: Date, tz: string): string {
  const [, m, d] = localDayKey(instant, tz).split("-");
  return `${d}/${m}`;
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
export function noticeMeta(
  report: Pick<WeeklyReport, "weekStart" | "weekEnd" | "metrics" | "attention" | "payments">,
): string {
  const contacts = report.metrics.find((m) => m.key === "contacts");
  const parts = [`Semana del ${weekLabel(report.weekStart, report.weekEnd)}`];
  if (contacts) {
    const diff = contacts.value - contacts.previous;
    parts.push(`${contacts.value} contactos nuevos${diff === 0 ? "" : ` (${diff > 0 ? "+" : ""}${diff})`}`);
  }
  const paid = (report.payments ?? []).reduce((a, p) => a + p.count, 0);
  if (paid > 0) parts.push(`${paid} ${paid === 1 ? "cobro confirmado" : "cobros confirmados"}`);
  const pending = report.attention.reduce((a, x) => a + x.count, 0);
  parts.push(pending === 0 ? "nada pendiente" : `${pending} ${pending === 1 ? "asunto pendiente" : "asuntos pendientes"}`);
  return parts.join(" · ");
}

/** One currency's confirmed payments, as summed by the database. */
export interface PaymentSumRow {
  currency: string;
  amount: { toString(): string } | number | null;
  count: number;
}

/**
 * Confirmed payments per currency for the week next to the week before.
 * Currencies are never added together (no exchange rates are invented); a
 * currency shows up when either week has payments in it.
 */
export function mergePaymentTotals(current: PaymentSumRow[], previous: PaymentSumRow[]): WeeklyReportPayments[] {
  const toNumber = (v: PaymentSumRow["amount"]) => (v == null ? 0 : Number(v.toString()));
  const byCurrency = new Map<string, WeeklyReportPayments>();
  const entry = (currency: string) => {
    let e = byCurrency.get(currency);
    if (!e) {
      e = { currency: currency as PaymentCurrency, amount: 0, count: 0, previousAmount: 0, previousCount: 0 };
      byCurrency.set(currency, e);
    }
    return e;
  };
  for (const r of current) Object.assign(entry(r.currency), { amount: toNumber(r.amount), count: r.count });
  for (const r of previous) Object.assign(entry(r.currency), { previousAmount: toNumber(r.amount), previousCount: r.count });
  const order = (c: string) => {
    const i = (PAYMENT_CURRENCIES as readonly string[]).indexOf(c);
    return i === -1 ? PAYMENT_CURRENCIES.length : i;
  };
  return [...byCurrency.values()].sort((a, b) => order(a.currency) - order(b.currency) || a.currency.localeCompare(b.currency));
}

/** A campaign send counts for conversations that start up to this long after it. */
export const CAMPAIGN_WINDOW_MS = 48 * 60 * 60 * 1000;

/** One new conversation of the week, with its first customer message and first answer. */
export interface InboxConversationRow {
  channel: string;
  createdAt: Date;
  contactHandle: string | null;
  firstIn: Date | null;
  firstOut: Date | null;
}

/**
 * Comparable key for a phone: its last 10 digits (so "+58 412…" and "0412…"
 * match), or null when it has too few digits to be a phone.
 */
export function phoneKey(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** How many rows started within the campaign window after a send, or from a form contact. */
function panelFlags(rows: InboxConversationRow[], sendTimes: Date[], formPhones: Set<string>) {
  const sends = sendTimes.map((d) => d.getTime()).sort((a, b) => a - b);
  // Latest send at or before t (binary search), so a busy week stays cheap.
  const lastSendBefore = (t: number): number | null => {
    let lo = 0;
    let hi = sends.length - 1;
    let found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sends[mid]! <= t) {
        found = sends[mid]!;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };
  return rows.map((r) => {
    const start = (r.firstIn ?? r.createdAt).getTime();
    const sent = lastSendBefore(start);
    const afterCampaign = sent !== null && start - sent < CAMPAIGN_WINDOW_MS;
    const key = phoneKey(r.contactHandle);
    const fromForm = key !== null && formPhones.has(key);
    return { afterCampaign, fromForm };
  });
}

/**
 * The Inbox section of the report: new conversations, how many got an answer
 * and how fast, and how many the panel brought in (after a campaign send or
 * from a form/funnel contact). Pure, so the attribution rules are unit-tested.
 */
export function summarizeInbox(input: {
  rows: InboxConversationRow[];
  previousRows: InboxConversationRow[];
  messagesIn: number;
  sendTimes: Date[];
  formPhones: Set<string>;
}): WeeklyReportInbox {
  const { rows } = input;
  const flags = panelFlags(rows, input.sendTimes, input.formPhones);
  const previousFlags = panelFlags(input.previousRows, input.sendTimes, input.formPhones);
  const replyMinutes: number[] = [];
  let answered = 0;
  for (const r of rows) {
    if (!r.firstOut) continue;
    answered++;
    if (r.firstIn && r.firstOut >= r.firstIn) replyMinutes.push((r.firstOut.getTime() - r.firstIn.getTime()) / 60000);
  }
  const channels = new Map<string, number>();
  for (const r of rows) channels.set(r.channel, (channels.get(r.channel) ?? 0) + 1);
  const med = median(replyMinutes);
  return {
    conversations: rows.length,
    previousConversations: input.previousRows.length,
    messagesIn: input.messagesIn,
    answered,
    medianReplyMinutes: med === null ? null : Math.round(med),
    afterCampaign: flags.filter((f) => f.afterCampaign).length,
    fromForms: flags.filter((f) => f.fromForm).length,
    fromPanel: flags.filter((f) => f.afterCampaign || f.fromForm).length,
    previousFromPanel: previousFlags.filter((f) => f.afterCampaign || f.fromForm).length,
    byChannel: [...channels.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
  };
}
