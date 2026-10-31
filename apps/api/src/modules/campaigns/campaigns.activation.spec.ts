import { describe, expect, it } from "vitest";

import { CampaignsService } from "./campaigns.module";

// Access the pure private static that decides whether a campaign with a schedule
// should be auto-activated (so the runner picks it up instead of leaving it as a
// draft that never fires).
const scheduledStatus = (
  CampaignsService as unknown as {
    scheduledStatus: (
      status: string | undefined,
      scheduleType: string | undefined | null,
      scheduleAt: string | undefined | null,
      scheduleTimes: string[] | undefined | null,
    ) => string | undefined;
  }
).scheduledStatus;

describe("CampaignsService.scheduledStatus (auto-activation)", () => {
  it("activates a daily campaign whose status wasn't chosen", () => {
    expect(scheduledStatus(undefined, "daily", null, ["20:00"])).toBe("programada");
  });

  it("keeps a campaign the user saved as «borrador», even with a schedule", () => {
    expect(scheduledStatus("borrador", "daily", null, ["20:00"])).toBe("borrador");
    expect(scheduledStatus("borrador", "once", "2026-09-10T20:00:00.000Z", [])).toBe("borrador");
  });

  it("activates a weekly campaign with times", () => {
    expect(scheduledStatus(undefined, "weekly", null, ["09:00", "18:00"])).toBe("programada");
  });

  it("activates a one-off with a scheduled datetime", () => {
    expect(scheduledStatus(undefined, "once", "2026-09-10T20:00:00.000Z", [])).toBe("programada");
  });

  it("leaves a draft with no schedule alone", () => {
    expect(scheduledStatus("borrador", "once", null, [])).toBe("borrador");
    expect(scheduledStatus("borrador", "daily", null, [])).toBe("borrador"); // no times yet
    expect(scheduledStatus(undefined, "once", null, [])).toBeUndefined();
  });

  it("never overrides an explicit non-draft status (respects pause/complete)", () => {
    expect(scheduledStatus("pausada", "daily", null, ["20:00"])).toBe("pausada");
    expect(scheduledStatus("completada", "once", "2026-09-10T20:00:00Z", [])).toBe("completada");
  });
});

describe("schedulingProblems", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  it("asks for message, destinations and a future date", async () => {
    const { schedulingProblems } = await import("./date-range");
    expect(schedulingProblems({ message: " ", targets: 0, scheduleType: "once", scheduleAt: "2020-01-01T08:00:00Z" }, now)).toEqual([
      "Escribe el mensaje o añade una imagen.",
      "Elige al menos un grupo o canal.",
      "La fecha de envío ya pasó: elige una fecha futura.",
    ]);
  });
  it("accepts an image instead of text and Facebook/Instagram instead of groups", async () => {
    const { schedulingProblems } = await import("./date-range");
    expect(
      schedulingProblems({ message: "", attachments: [{ url: "x" }], targets: 0, channels: ["fb"], scheduleType: "daily" }, now),
    ).toEqual([]);
  });
});
