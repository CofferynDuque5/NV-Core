import { describe, expect, it } from "vitest";

import { buildAttribution, cleanUrl } from "./attribution";

const ctx = { via: "form" as const, formId: "f1", formName: "Kit verde" };
const now = new Date("2026-10-26T12:00:00.000Z");

describe("lead attribution", () => {
  it("keeps UTM values, lowercases source and medium, and strips query strings from URLs", () => {
    const a = buildAttribution(
      {
        utmSource: " Instagram ",
        utmMedium: "Paid",
        utmCampaign: "Kit-Verde Oct",
        landingUrl: "https://pulso.pe/kit?utm_source=instagram&email=ana@x.com#top",
        referrer: "https://l.instagram.com/?u=abc",
      },
      ctx,
      now,
    );
    expect(a).toEqual({
      source: "instagram",
      medium: "paid",
      campaign: "Kit-Verde Oct",
      landingUrl: "https://pulso.pe/kit",
      referrer: "https://l.instagram.com/",
      via: "form",
      formId: "f1",
      formName: "Kit verde",
      capturedAt: now.toISOString(),
    });
  });

  it("falls back to the referring site, then to 'directo'", () => {
    const ref = buildAttribution({ referrer: "https://www.google.com/search", landingUrl: "https://pulso.pe/" }, ctx);
    expect(ref.source).toBe("google.com");
    expect(ref.medium).toBe("referral");
    // Navigation inside the same site is not a referral.
    const self = buildAttribution({ referrer: "https://pulso.pe/blog", landingUrl: "https://pulso.pe/kit" }, ctx);
    expect(self.source).toBe("directo");
    expect(self.medium).toBeUndefined();
    expect(buildAttribution(undefined, ctx).source).toBe("directo");
  });

  it("rejects non-http URLs and caps long values", () => {
    expect(cleanUrl("javascript:alert(1)")).toBeUndefined();
    expect(cleanUrl("not a url")).toBeUndefined();
    const a = buildAttribution({ utmCampaign: "x".repeat(400) }, ctx);
    expect(a.campaign).toHaveLength(120);
  });
});
