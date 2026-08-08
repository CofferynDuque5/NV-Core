import type { SequencePreviewStep, SequenceStep } from "@nv/domain";

/** Pure scheduling helpers for the drip engine — no I/O, fully unit-testable. */

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The cumulative send schedule for a sequence: each step's offset in days from
 * enrollment (step 0 offset = its own delay; later steps add up).
 */
export function previewSchedule(steps: SequenceStep[]): SequencePreviewStep[] {
  let offset = 0;
  return steps.map((s, index) => {
    offset += Math.max(0, s.delayDays ?? 0);
    return { index, channel: s.channel, offsetDays: offset, body: s.body };
  });
}

/** Recipient address for a step's channel (email → email, else phone). */
export function recipientFor(
  channel: SequenceStep["channel"],
  contact: { email?: string | null; phone?: string | null },
): string | null {
  const addr = channel === "email" ? contact.email : contact.phone;
  return addr && addr.trim() ? addr.trim() : null;
}
