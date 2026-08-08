import { describe, expect, it } from "vitest";
import type { SequenceStep } from "@nv/domain";

import { addDays, previewSchedule, recipientFor } from "./sequence-engine";

const step = (delayDays: number, channel: SequenceStep["channel"] = "email"): SequenceStep => ({
  id: `s${delayDays}`,
  delayDays,
  channel,
  body: "hi",
});

describe("sequence-engine", () => {
  it("addDays advances by whole days", () => {
    const base = new Date("2026-08-01T00:00:00.000Z");
    expect(addDays(base, 2).toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("previewSchedule accumulates offsets from enrollment", () => {
    const schedule = previewSchedule([step(0), step(2), step(3)]);
    expect(schedule.map((s) => s.offsetDays)).toEqual([0, 2, 5]);
    expect(schedule[0]).toMatchObject({ index: 0, channel: "email" });
  });

  it("recipientFor picks email for email steps, else phone", () => {
    expect(recipientFor("email", { email: "a@x.com", phone: "+1" })).toBe("a@x.com");
    expect(recipientFor("wa", { email: "a@x.com", phone: "+1" })).toBe("+1");
    expect(recipientFor("email", { email: null, phone: "+1" })).toBeNull();
    expect(recipientFor("wa", { phone: "  " })).toBeNull();
  });
});
