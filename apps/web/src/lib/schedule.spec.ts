import { describe, expect, it } from "vitest";
import type { Campaign } from "@nv/domain";

import { formatTime12h, isScheduled, scheduleLabel } from "./schedule";

function c(partial: Partial<Campaign>): Campaign {
  return {
    id: "c1",
    name: "Camp",
    status: "programada",
    channels: [],
    progress: 0,
    posts: 0,
    ...partial,
  } as Campaign;
}

describe("schedule helpers", () => {
  it("formatTime12h converts 24h HH:MM to AM/PM", () => {
    expect(formatTime12h("00:00")).toBe("12:00 AM");
    expect(formatTime12h("09:05")).toBe("9:05 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
    expect(formatTime12h("15:30")).toBe("3:30 PM");
    expect(formatTime12h("23:45")).toBe("11:45 PM");
  });

  it("formatTime12h returns input unchanged when unparseable", () => {
    expect(formatTime12h("nope")).toBe("nope");
  });

  it("isScheduled requires a schedule and a non-finished status", () => {
    expect(isScheduled(c({ scheduleAt: "09:00", scheduleType: "daily" }))).toBe(true);
    expect(isScheduled(c({ scheduleAt: null }))).toBe(false);
    expect(isScheduled(c({ scheduleAt: "09:00", status: "completada" }))).toBe(false);
  });

  it("scheduleLabel describes daily/weekly/once with AM/PM", () => {
    expect(scheduleLabel(c({ scheduleType: "daily", scheduleAt: "08:00" }))).toBe("Diario · 8:00 AM");
    expect(
      scheduleLabel(c({ scheduleType: "weekly", scheduleAt: "20:00", scheduleDays: [1, 3] })),
    ).toBe("Semanal · Lun, Mié · 8:00 PM");
    expect(scheduleLabel(c({ scheduleAt: null }))).toBe("Sin programar");
  });
});
