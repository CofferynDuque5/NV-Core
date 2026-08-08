import type { SequenceChannel, SequenceStep } from "@nv/domain";

/** Pure helpers for the sequences UI. */

export const CHANNEL_LABEL: Record<SequenceChannel, string> = {
  email: "Email",
  wa: "WhatsApp",
  tg: "Telegram",
};

/** Cumulative offset (days from enrollment) each step is sent at. */
export function stepOffsets(steps: SequenceStep[]): number[] {
  let offset = 0;
  return steps.map((s) => {
    offset += Math.max(0, s.delayDays ?? 0);
    return offset;
  });
}

/** Total duration of the sequence in days (offset of the last step). */
export function totalDays(steps: SequenceStep[]): number {
  const offsets = stepOffsets(steps);
  return offsets.length ? offsets[offsets.length - 1]! : 0;
}

/** Human label for a step's send timing (e.g. "Al instante", "Día 2"). */
export function stepWhen(offsetDays: number): string {
  return offsetDays <= 0 ? "Al instante" : `Día ${offsetDays}`;
}
