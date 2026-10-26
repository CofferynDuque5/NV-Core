import { describe, expect, it } from "vitest";

import { attributionLine, leadSourceLabel, readAttribution } from "./attribution";

describe("readAttribution", () => {
  it("reads utm params and the page itself on a direct visit", () => {
    expect(
      readAttribution("https://app.nv.tv/f/f1?utm_source=instagram&utm_campaign=kit&x=1", "https://l.instagram.com/"),
    ).toEqual({
      utmSource: "instagram",
      utmCampaign: "kit",
      landingUrl: "https://app.nv.tv/f/f1",
      referrer: "https://l.instagram.com/",
    });
  });

  it("uses the host page passed by the embed snippet instead of the iframe", () => {
    const a = readAttribution(
      "https://app.nv.tv/f/f1?utm_source=fb&nv_page=https%3A%2F%2Fpulso.pe%2Fkit&nv_ref=https%3A%2F%2Fm.facebook.com%2F",
      "https://pulso.pe/kit",
    );
    expect(a).toMatchObject({ utmSource: "fb", landingUrl: "https://pulso.pe/kit", referrer: "https://m.facebook.com/" });
  });

  it("adds the funnel and survives a broken URL", () => {
    expect(readAttribution("https://app.nv.tv/fn/x", "", "fn1")).toEqual({
      landingUrl: "https://app.nv.tv/fn/x",
      funnelId: "fn1",
    });
    expect(readAttribution("::", "", "fn1")).toEqual({ funnelId: "fn1" });
  });
});

describe("attribution labels", () => {
  it("joins source, medium and campaign and names the special buckets", () => {
    expect(
      attributionLine({ source: "instagram", medium: "paid", campaign: "kit", via: "form", capturedAt: "" }),
    ).toBe("instagram · paid · kit");
    expect(leadSourceLabel(null)).toMatch(/Sin origen/);
    expect(leadSourceLabel("directo")).toMatch(/Directo/);
    expect(leadSourceLabel("google.com")).toBe("google.com");
  });
});
