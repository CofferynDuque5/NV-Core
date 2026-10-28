import { BadRequestException } from "@nestjs/common";

/** A calendar day, "YYYY-MM-DD". */
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The server's calendar day (same clock the daily/weekly "HH:MM" times use). */
export function localDayKey(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether `day` falls inside the optional, inclusive [start, end] range. */
export function inDateRange(day: string, start?: string | null, end?: string | null): boolean {
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

/** Reject a range that ends before it starts. */
export function checkDateRange(start?: string | null, end?: string | null): void {
  if (start && end && end < start) {
    throw new BadRequestException("La fecha «hasta» no puede ser antes de la fecha «desde».");
  }
}
