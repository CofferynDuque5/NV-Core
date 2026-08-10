import { describe, expect, it } from "vitest";
import type { SendLogEntry } from "@nv/domain";

import { channelCounts, channelOf, filterHistorial, searchHistorial, summarize } from "./historial";

function e(partial: Partial<SendLogEntry>): SendLogEntry {
  return { id: Math.random().toString(36).slice(2), ok: true, createdAt: "2026-01-01T00:00:00Z", ...partial };
}

const waSend = e({ target: "wa", groupName: "Universidad", ok: true });
const waGroup = e({ groupName: "Trabajo", target: null, ok: false });
const fb = e({ target: "facebook", postId: "p1", ok: true });
const ig = e({ target: "instagram", postId: "p2", ok: true });
const rows: SendLogEntry[] = [waSend, waGroup, fb, ig];

describe("historial helpers", () => {
  it("channelOf classifies by target / group presence", () => {
    expect(channelOf(waSend)).toBe("whatsapp");
    expect(channelOf(waGroup)).toBe("whatsapp"); // group send with null target
    expect(channelOf(fb)).toBe("facebook");
    expect(channelOf(ig)).toBe("instagram");
    expect(channelOf(e({ target: "x" }))).toBe("otro");
  });

  it("filterHistorial filters by channel and 'all' returns everything", () => {
    expect(filterHistorial(rows, "all")).toHaveLength(4);
    expect(filterHistorial(rows, "whatsapp")).toHaveLength(2);
    expect(filterHistorial(rows, "facebook")).toHaveLength(1);
    expect(filterHistorial(rows, "instagram")).toHaveLength(1);
  });

  it("summarize counts ok/error/total", () => {
    expect(summarize(rows)).toEqual({ total: 4, ok: 3, error: 1 });
    expect(summarize([])).toEqual({ total: 0, ok: 0, error: 0 });
  });

  it("channelCounts tallies each channel", () => {
    const c = channelCounts(rows);
    expect(c.all).toBe(4);
    expect(c.whatsapp).toBe(2);
    expect(c.facebook).toBe(1);
    expect(c.instagram).toBe(1);
  });

  it("searchHistorial combines channel + text + date range", () => {
    const dated = [
      e({ campaignName: "Promo enero", groupName: "Universidad", target: "wa", createdAt: "2026-01-10T10:00:00Z" }),
      e({ campaignName: "Promo marzo", target: "facebook", createdAt: "2026-03-10T10:00:00Z" }),
    ];
    expect(searchHistorial(dated, { q: "enero" })).toHaveLength(1);
    expect(searchHistorial(dated, { channel: "facebook" })).toHaveLength(1);
    expect(searchHistorial(dated, { from: "2026-02-01" })).toHaveLength(1);
    expect(searchHistorial(dated, { from: "2026-01-01", to: "2026-01-31" })).toHaveLength(1);
    expect(searchHistorial(dated, {})).toHaveLength(2);
  });
});
