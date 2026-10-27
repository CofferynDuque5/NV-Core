import { describe, expect, it } from "vitest";

import { timeLeft } from "./plan-access";

describe("timeLeft", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("muestra horas, minutos o días según lo que quede", () => {
    expect(timeLeft(at(23.5 * 3_600_000), now)).toBe("23 h");
    expect(timeLeft(at(59 * 60_000 + 10), now)).toBe("60 min");
    expect(timeLeft(at(3 * 86_400_000), now)).toBe("3 días");
  });

  it("nunca baja de 1 min", () => {
    expect(timeLeft(at(-5_000), now)).toBe("1 min");
  });
});
