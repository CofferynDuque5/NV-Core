import { describe, expect, it } from "vitest";

import { conversionRate, money, referralLink } from "./affiliates";

describe("affiliates helpers", () => {
  it("referralLink builds the API /r/:code URL", () => {
    expect(referralLink("https://api.nv.com", "ana-1a2b")).toBe("https://api.nv.com/api/r/ana-1a2b");
    expect(referralLink("https://api.nv.com/", "x")).toBe("https://api.nv.com/api/r/x");
  });

  it("conversionRate = conversions/clicks %, 0 when no clicks", () => {
    expect(conversionRate({ clicks: 0, conversions: 0 })).toBe(0);
    expect(conversionRate({ clicks: 200, conversions: 10 })).toBe(5);
  });

  it("money formats with two decimals", () => {
    expect(money(20)).toBe("20.00");
    expect(money(1234.5)).toContain("234.5");
  });
});
