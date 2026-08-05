import { describe, expect, it } from "vitest";
import type { Post } from "@nv/domain";

import {
  applyFilters,
  countByChannel,
  groupByDay,
  monthMatrix,
  rangeLabel,
  scheduledOnly,
  startOfWeek,
  step,
  weekDays,
  ymd,
} from "./calendar";

function post(over: Partial<Post> = {}): Post {
  return {
    id: Math.random().toString(36).slice(2),
    channel: "ig",
    title: "P",
    scheduledAt: "2026-09-02T10:00:00.000Z",
    status: "scheduled",
    hashtags: [],
    ...over,
  } as Post;
}

describe("date math", () => {
  it("startOfWeek returns Monday", () => {
    // 2026-09-02 is a Wednesday → week starts Monday 2026-08-31.
    expect(ymd(startOfWeek(new Date(2026, 8, 2)))).toBe("2026-08-31");
  });

  it("weekDays returns 7 consecutive days Mon→Sun", () => {
    const days = weekDays(new Date(2026, 8, 2));
    expect(days).toHaveLength(7);
    expect(ymd(days[0]!)).toBe("2026-08-31");
    expect(ymd(days[6]!)).toBe("2026-09-06");
  });

  it("monthMatrix returns 42 cells starting on a Monday", () => {
    const cells = monthMatrix(new Date(2026, 8, 15));
    expect(cells).toHaveLength(42);
    expect(cells[0]!.getDay()).toBe(1); // Monday
  });

  it("step advances by the right unit per view", () => {
    const c = new Date(2026, 8, 15);
    expect(step("day", c, 1).getDate()).toBe(16);
    expect(ymd(step("week", c, 1))).toBe("2026-09-22");
    expect(step("month", c, 1).getMonth()).toBe(9);
  });

  it("rangeLabel formats each view", () => {
    expect(rangeLabel("month", new Date(2026, 8, 1))).toContain("Septiembre");
    expect(rangeLabel("week", new Date(2026, 8, 2))).toMatch(/Ago|Sep/);
  });
});

describe("filtering + grouping", () => {
  const posts = [
    post({ id: "a", channel: "ig", status: "scheduled" }),
    post({ id: "b", channel: "wa", status: "draft", scheduledAt: null }),
    post({ id: "c", channel: "ig", status: "sent", campaignId: "c1" }),
  ];

  it("scheduledOnly drops posts without a date", () => {
    expect(scheduledOnly(posts).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("applyFilters narrows by channel/status/campaign", () => {
    expect(applyFilters(posts, { channels: ["ig"], statuses: [], campaignId: null })).toHaveLength(2);
    expect(applyFilters(posts, { channels: [], statuses: ["draft"], campaignId: null })).toHaveLength(1);
    expect(applyFilters(posts, { channels: [], statuses: [], campaignId: "c1" })).toHaveLength(1);
  });

  it("groupByDay buckets by local day and sorts by time", () => {
    const g = groupByDay([
      post({ id: "late", scheduledAt: "2026-09-02T18:00:00.000Z" }),
      post({ id: "early", scheduledAt: "2026-09-02T06:00:00.000Z" }),
    ]);
    const day = g.get(ymd(new Date("2026-09-02T06:00:00.000Z")))!;
    expect(day.map((p) => p.id)).toEqual(["early", "late"]);
  });

  it("countByChannel tallies per channel", () => {
    expect(countByChannel(posts)).toEqual({ ig: 2, wa: 1 });
  });
});
