import { describe, expect, it } from "vitest";
import type { SequenceStep } from "@nv/domain";

import { stepOffsets, stepWhen, totalDays } from "./sequences";

const steps: SequenceStep[] = [
  { id: "a", delayDays: 0, channel: "email", body: "1" },
  { id: "b", delayDays: 2, channel: "wa", body: "2" },
  { id: "c", delayDays: 3, channel: "email", body: "3" },
];

describe("sequences helpers", () => {
  it("stepOffsets accumulates delays", () => {
    expect(stepOffsets(steps)).toEqual([0, 2, 5]);
  });
  it("totalDays is the last offset", () => {
    expect(totalDays(steps)).toBe(5);
    expect(totalDays([])).toBe(0);
  });
  it("stepWhen labels immediate vs day N", () => {
    expect(stepWhen(0)).toBe("Al instante");
    expect(stepWhen(2)).toBe("Día 2");
  });
});
