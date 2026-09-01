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
  it("activates a daily campaign left as draft", () => {
    expect(scheduledStatus("borrador", "daily", null, ["20:00"])).toBe("programada");
  });

  it("activates a weekly campaign with times", () => {
    expect(scheduledStatus(undefined, "weekly", null, ["09:00", "18:00"])).toBe("programada");
  });

  it("activates a one-off with a scheduled datetime", () => {
    expect(scheduledStatus("borrador", "once", "2026-09-10T20:00:00.000Z", [])).toBe("programada");
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
