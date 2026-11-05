/**
 * Contact custom fields (defined per brand) and birthdays. Pure helpers shared
 * by the API (validation, segment filters, automations) and the web forms.
 */

export const CONTACT_FIELD_TYPES = ["text", "number", "date", "select"] as const;
export type ContactFieldType = (typeof CONTACT_FIELD_TYPES)[number];

export const CONTACT_FIELD_TYPE_LABELS: Record<ContactFieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  select: "Lista de opciones",
};

export interface ContactFieldDef {
  /** Stable id used in Contact.custom and in segment rules («custom.<key>»). */
  key: string;
  label: string;
  type: ContactFieldType;
  /** Choices, for "select". */
  options?: string[];
}

export const MAX_CONTACT_FIELDS = 20;
const MAX_VALUE = 500;
const MAX_OPTIONS = 30;

/** Lowercase ASCII slug for a label: «Talla de ropa» → «talla_de_ropa». */
export function fieldKeyFor(label: string, taken: ReadonlySet<string> = new Set()): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "campo";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  return key;
}

/** Valid, de-duplicated field definitions (unknown shapes are dropped). */
export function cleanContactFields(raw: unknown): ContactFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: ContactFieldDef[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_CONTACT_FIELDS) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = String(r.label ?? "").trim().slice(0, 40);
    if (!label) continue;
    const type = (CONTACT_FIELD_TYPES as readonly string[]).includes(String(r.type))
      ? (r.type as ContactFieldType)
      : "text";
    const wanted = typeof r.key === "string" && /^[a-z0-9_]{1,30}$/.test(r.key) ? r.key : "";
    const key = wanted && !keys.has(wanted) ? wanted : fieldKeyFor(label, keys);
    keys.add(key);
    const def: ContactFieldDef = { key, label, type };
    if (type === "select") {
      const opts = Array.isArray(r.options) ? r.options : [];
      def.options = [...new Set(opts.map((o) => String(o).trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_OPTIONS);
      if (def.options.length === 0) def.type = "text";
      if (def.type === "text") delete def.options;
    }
    out.push(def);
  }
  return out;
}

/** Error text for a value that does not fit its field, or null. */
export function customValueError(def: ContactFieldDef, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > MAX_VALUE) return `«${def.label}» es muy largo (máximo ${MAX_VALUE} caracteres).`;
  if (def.type === "number" && !Number.isFinite(Number(v.replace(",", "."))))
    return `«${def.label}» debe ser un número.`;
  if (def.type === "date" && !isIsoDate(v)) return `«${def.label}» debe ser una fecha (AAAA-MM-DD).`;
  if (def.type === "select" && !(def.options ?? []).includes(v))
    return `«${v}» no es una opción de «${def.label}».`;
  return null;
}

/**
 * Keep only the brand's fields with valid values; empty values are removed.
 * Throws-free: invalid values are reported in `errors` and left out.
 */
export function cleanCustomValues(
  defs: readonly ContactFieldDef[],
  raw: unknown,
): { values: Record<string, string>; errors: string[] } {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { values, errors };
  const input = raw as Record<string, unknown>;
  for (const def of defs) {
    if (!(def.key in input)) continue;
    const v = input[def.key] == null ? "" : String(input[def.key]).trim();
    if (!v) continue;
    const err = customValueError(def, v);
    if (err) errors.push(err);
    else values[def.key] = def.type === "number" ? v.replace(",", ".") : v;
  }
  return { values, errors };
}

function isIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return !!m && validDay(Number(m[2]), Number(m[3]), Number(m[1]));
}

function validDay(month: number, day: number, year?: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year == null || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day <= max;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Birthday as stored: «YYYY-MM-DD» or «MM-DD» when the year is unknown.
 * Accepts «1990-03-15», «15/03/1990», «15/03», «15-03» and «03-15» (stored form).
 * Returns null for an empty input and undefined when it is not a real date.
 */
export function normalizeBirthday(input: string | null | undefined): string | null | undefined {
  const v = (input ?? "").trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const thisYear = new Date().getUTCFullYear();
    if (y < 1900 || y > thisYear || !validDay(mo, d, y)) return undefined;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/.exec(v);
  if (m) {
    // Stored «MM-DD» round-trips; anything else typed by people is day first.
    const stored = /^\d{2}-\d{2}$/.test(v);
    const d = Number(stored ? m[2] : m[1]);
    const mo = Number(stored ? m[1] : m[2]);
    const y = m[3] ? Number(m[3]) : undefined;
    if (y != null && (y < 1900 || y > new Date().getUTCFullYear())) return undefined;
    if (!validDay(mo, d, y)) return undefined;
    return y != null ? `${y}-${pad(mo)}-${pad(d)}` : `${pad(mo)}-${pad(d)}`;
  }
  return undefined;
}

/** «MM-DD» part of a stored birthday. */
export function birthdayMonthDay(b: string | null | undefined): string | null {
  return b && /^(\d{4}-)?\d{2}-\d{2}$/.test(b) ? b.slice(-5) : null;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «15 de marzo» (or «15 de marzo de 1990»). */
export function birthdayLabel(b: string | null | undefined, withYear = false): string {
  const md = birthdayMonthDay(b);
  if (!md) return "";
  const [mo, d] = md.split("-").map(Number) as [number, number];
  const base = `${d} de ${MONTHS[mo - 1]}`;
  return withYear && b!.length === 10 ? `${base} de ${b!.slice(0, 4)}` : base;
}

function isLeap(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

/**
 * «MM-DD» keys celebrated from `todayKey` (YYYY-MM-DD) through `days` days
 * later. In a non-leap year, 29 February birthdays are celebrated on the 28th.
 */
export function celebratedMonthDays(todayKey: string, days: number): string[] {
  const start = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  const out = new Set<string>();
  const n = Math.max(0, Math.min(366, Math.floor(days)));
  for (let i = 0; i <= n; i++) {
    const d = new Date(start + i * 86_400_000);
    const md = `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    out.add(md);
    if (md === "02-28" && !isLeap(d.getUTCFullYear())) out.add("02-29");
  }
  return [...out];
}

/** Days from `todayKey` to the next celebration (0 = today), or null. */
export function daysUntilBirthday(b: string | null | undefined, todayKey: string): number | null {
  const md = birthdayMonthDay(b);
  if (!md) return null;
  for (let i = 0; i <= 366; i++) {
    if (celebratedMonthDays(addDays(todayKey, i), 0).includes(md)) return i;
  }
  return null;
}

function addDays(key: string, n: number): string {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Age on the next celebration, when the year is known. */
export function ageOnNextBirthday(b: string | null | undefined, todayKey: string): number | null {
  if (!b || b.length !== 10) return null;
  const days = daysUntilBirthday(b, todayKey);
  if (days == null) return null;
  return Number(addDays(todayKey, days).slice(0, 4)) - Number(b.slice(0, 4));
}
