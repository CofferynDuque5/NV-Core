import { describe, expect, it } from "vitest";

import {
  heatIntensity,
  heatmapMax,
  peakLabel,
  peakSlot,
  shortDate,
  sumSeries,
  toChartSeries,
} from "./analytics";

const pt = (date: string, over: Partial<{ posts: number; contacts: number; conversations: number; messages: number }> = {}) => ({
  date,
  posts: 0,
  contacts: 0,
  conversations: 0,
  messages: 0,
  ...over,
});

describe("shortDate", () => {
  it("formats an ISO date to a compact Spanish label", () => {
    expect(shortDate("2026-08-05")).toBe("5 ago");
    expect(shortDate("2026-01-31")).toBe("31 ene");
  });
  it("returns the input when it is not a date", () => {
    expect(shortDate("nope")).toBe("nope");
  });
});

describe("toChartSeries", () => {
  it("attaches labels and tolerates undefined", () => {
    expect(toChartSeries(undefined)).toEqual([]);
    const out = toChartSeries([pt("2026-08-05", { posts: 2 })]);
    expect(out[0]!.label).toBe("5 ago");
    expect(out[0]!.posts).toBe(2);
  });
});

describe("sumSeries", () => {
  it("sums a metric across the period", () => {
    const s = [pt("2026-08-01", { messages: 3 }), pt("2026-08-02", { messages: 4 })];
    expect(sumSeries(s, "messages")).toBe(7);
    expect(sumSeries(undefined, "messages")).toBe(0);
  });
});

describe("heatmap helpers", () => {
  const matrix = [
    [0, 0, 0],
    [0, 5, 2],
    [1, 0, 0],
  ];
  it("finds the max cell", () => {
    expect(heatmapMax(matrix)).toBe(5);
    expect(heatmapMax([[0, 0]])).toBe(0);
  });
  it("normalizes intensity to 0..1", () => {
    expect(heatIntensity(5, 5)).toBe(1);
    expect(heatIntensity(0, 5)).toBe(0);
    expect(heatIntensity(2, 5)).toBeCloseTo(0.4);
    expect(heatIntensity(3, 0)).toBe(0);
  });
  it("locates the peak slot and labels it", () => {
    const slot = peakSlot(matrix);
    expect(slot).toEqual({ day: 1, hour: 1, value: 5 });
    expect(peakLabel(slot)).toBe("Lun 01:00");
  });
  it("returns an empty label with no activity", () => {
    expect(peakLabel(peakSlot([[0, 0], [0, 0]]))).toBe("");
  });
});
