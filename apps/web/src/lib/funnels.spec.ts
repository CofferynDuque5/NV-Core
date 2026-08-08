import { describe, expect, it } from "vitest";
import type { FunnelPage } from "@nv/domain";

import { funnelConversion, funnelEntries, publicFunnelUrl } from "./funnels";

const steps: FunnelPage[] = [
  { id: "s1", name: "Opt-in", type: "optin", views: 200 },
  { id: "s2", name: "Venta", type: "sales", views: 80 },
  { id: "s3", name: "Gracias", type: "thankyou", views: 40 },
];

describe("funnels helpers", () => {
  it("funnelEntries = first step views", () => {
    expect(funnelEntries(steps)).toBe(200);
    expect(funnelEntries([])).toBe(0);
  });

  it("funnelConversion = last/first %, 0 when <2 steps or no entries", () => {
    expect(funnelConversion(steps)).toBe(20); // 40/200
    expect(funnelConversion([steps[0]!])).toBe(0);
    expect(funnelConversion([{ ...steps[0]!, views: 0 }, steps[1]!])).toBe(0);
  });

  it("publicFunnelUrl builds /fn/:id", () => {
    expect(publicFunnelUrl("https://app.nv.com/", "fn1")).toBe("https://app.nv.com/fn/fn1");
  });
});
