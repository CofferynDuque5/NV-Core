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

/** What a campaign needs before it can be «programada» or «activa». */
export interface ReadyCheck {
  message?: string | null;
  attachments?: unknown;
  targets: number;
  channels?: string[] | null;
  postToWaStatus?: boolean | null;
  scheduleType?: string | null;
  scheduleAt?: string | null;
}

/** Problems that keep a campaign from being scheduled, in plain words (empty = ready). */
export function schedulingProblems(c: ReadyCheck, now = new Date()): string[] {
  const problems: string[] = [];
  const hasMedia = Array.isArray(c.attachments) && c.attachments.length > 0;
  if (!c.message?.trim() && !hasMedia) problems.push("Escribe el mensaje o añade una imagen.");
  const social = (c.channels ?? []).some((ch) => ch === "fb" || ch === "ig");
  if (c.targets === 0 && !social && !c.postToWaStatus) problems.push("Elige al menos un grupo o canal.");
  if (c.scheduleType === "once" && c.scheduleAt) {
    const at = new Date(c.scheduleAt);
    if (!Number.isNaN(at.getTime()) && at.getTime() < now.getTime() - 60_000) {
      problems.push("La fecha de envío ya pasó: elige una fecha futura.");
    }
  }
  return problems;
}

export function assertReadyToSchedule(status: string | undefined, c: ReadyCheck): void {
  if (status !== "programada" && status !== "activa") return;
  const problems = schedulingProblems(c);
  if (problems.length) {
    throw new BadRequestException(`Para programar la campaña: ${problems.join(" ")} O guárdala como borrador.`);
  }
}
