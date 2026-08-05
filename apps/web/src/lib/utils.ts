import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Placeholder for empty metrics — never fabricate numbers. */
export const EMPTY_METRIC = "—";

/** Relative time in Spanish ("hace 5 min", "hace 2 h", or a date). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY_METRIC;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return EMPTY_METRIC;
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString();
}

/** Absolute local date-time; echoes the input when unparseable. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
