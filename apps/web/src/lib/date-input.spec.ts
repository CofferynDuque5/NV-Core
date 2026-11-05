import { describe, expect, it } from "vitest";
import { fromDateInput, toDateInput } from "./date-input";

describe("fechas de <input type=date>", () => {
  it("convierte ida y vuelta sin mover el día", () => {
    const iso = fromDateInput("2026-10-31");
    expect(iso).not.toBeNull();
    expect(toDateInput(iso!)).toBe("2026-10-31");
  });

  it("ignora valores vacíos o inválidos", () => {
    expect(toDateInput()).toBe("");
    expect(toDateInput("no-es-fecha")).toBe("");
    expect(fromDateInput("")).toBeNull();
    expect(fromDateInput("2026-10")).toBeNull();
  });
});
