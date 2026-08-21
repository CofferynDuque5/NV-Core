import { describe, expect, it } from "vitest";

import { campaignOccurrences, type SchedulableCampaign } from "./campaign-occurrences";

function c(over: Partial<SchedulableCampaign> = {}): SchedulableCampaign {
  return {
    id: "c1",
    name: "Promo",
    status: "activa",
    channels: ["wa"],
    scheduleType: "daily",
    scheduleAt: null,
    scheduleTimes: [],
    scheduleDays: [],
    ...over,
  };
}

const gte = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01
const lt = new Date(Date.UTC(2026, 0, 8)); // exclusive → 7 days

describe("campaignOccurrences", () => {
  it("daily with two times → 2 events per day", () => {
    const evs = campaignOccurrences(c({ scheduleTimes: ["09:00", "18:00"] }), gte, lt);
    expect(evs).toHaveLength(7 * 2);
    expect(evs.every((e) => e.campaignId === "c1" && e.title === "Promo")).toBe(true);
  });

  it("weekly only on configured weekdays", () => {
    // 2026-01-01 is a Thursday (getUTCDay 4). Range covers Thu..Wed.
    const evs = campaignOccurrences(
      c({ scheduleType: "weekly", scheduleDays: [4], scheduleTimes: ["10:00"] }),
      gte,
      lt,
    );
    expect(evs).toHaveLength(1);
    expect(evs[0]!.date).toBe(new Date(Date.UTC(2026, 0, 1, 10, 0)).toISOString());
  });

  it("once inside the range yields one event; paused yields none", () => {
    const at = new Date(Date.UTC(2026, 0, 3, 15, 30)).toISOString();
    expect(campaignOccurrences(c({ scheduleType: "once", scheduleAt: at }), gte, lt)).toHaveLength(1);
    expect(campaignOccurrences(c({ status: "pausada", scheduleTimes: ["09:00"] }), gte, lt)).toHaveLength(0);
  });

  it("falls back to scheduleAt when scheduleTimes is empty", () => {
    const evs = campaignOccurrences(c({ scheduleAt: "08:00" }), gte, lt);
    expect(evs).toHaveLength(7);
  });
});
