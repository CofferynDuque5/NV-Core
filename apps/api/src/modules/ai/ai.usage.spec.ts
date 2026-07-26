import { describe, expect, it } from "vitest";

import { estimateTokens, usagePeriod } from "./ai.usage";

describe("usagePeriod", () => {
  it("formats YYYY-MM in UTC, zero-padded", () => {
    expect(usagePeriod(new Date("2026-01-09T10:00:00Z"))).toBe("2026-01");
    expect(usagePeriod(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("estimateTokens", () => {
  it("approximates ~4 chars per token across inputs", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("abcd", "efgh")).toBe(2);
  });

  it("handles empty input", () => {
    expect(estimateTokens()).toBe(0);
    expect(estimateTokens("")).toBe(0);
  });
});
