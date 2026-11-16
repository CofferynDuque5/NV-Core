import { describe, expect, it } from "vitest";

import {
  ageOnNextBirthday,
  birthdayLabel,
  celebratedMonthDays,
  cleanContactFields,
  cleanCustomValues,
  daysUntilBirthday,
  fieldKeyFor,
  normalizeBirthday,
} from "@nv/domain";

describe("contact fields", () => {
  it("makes keys and cleans definitions", () => {
    expect(fieldKeyFor("Talla de ropa")).toBe("talla_de_ropa");
    expect(fieldKeyFor("Ciudad", new Set(["ciudad"]))).toBe("ciudad_2");
    const defs = cleanContactFields([
      { label: "Ciudad", type: "text" },
      { label: "Plan", type: "select", options: ["Mensual", "Anual", "Mensual", ""] },
      { label: "Vacío", type: "select", options: [] },
      { label: "", type: "text" },
      "x",
    ]);
    expect(defs).toEqual([
      { key: "ciudad", label: "Ciudad", type: "text" },
      { key: "plan", label: "Plan", type: "select", options: ["Mensual", "Anual"] },
      { key: "vacio", label: "Vacío", type: "text" },
    ]);
  });

  it("keeps only valid values of known fields", () => {
    const defs = cleanContactFields([
      { label: "Pantallas", type: "number" },
      { label: "Plan", type: "select", options: ["Mensual"] },
      { label: "Vence", type: "date" },
    ]);
    const r = cleanCustomValues(defs, { pantallas: "2,5", plan: "Diario", vence: "2026-02-30", otro: "x" });
    expect(r.values).toEqual({ pantallas: "2.5" });
    expect(r.errors).toHaveLength(2);
  });
});

describe("birthdays", () => {
  it("normalizes what people type", () => {
    expect(normalizeBirthday("15/03/1990")).toBe("1990-03-15");
    expect(normalizeBirthday("15/3")).toBe("03-15");
    expect(normalizeBirthday("03-15")).toBe("03-15");
    expect(normalizeBirthday("1990-03-15")).toBe("1990-03-15");
    expect(normalizeBirthday("29/02")).toBe("02-29");
    expect(normalizeBirthday("29/02/2001")).toBeUndefined();
    expect(normalizeBirthday("31/04")).toBeUndefined();
    expect(normalizeBirthday("")).toBeNull();
    expect(normalizeBirthday("mañana")).toBeUndefined();
  });

  it("finds upcoming birthdays, 29 Feb on the 28th in common years", () => {
    expect(celebratedMonthDays("2026-12-30", 3)).toEqual(["12-30", "12-31", "01-01", "01-02"]);
    expect(celebratedMonthDays("2027-02-28", 0)).toEqual(["02-28", "02-29"]);
    expect(celebratedMonthDays("2028-02-28", 0)).toEqual(["02-28"]);
    expect(daysUntilBirthday("1990-03-15", "2026-03-10")).toBe(5);
    expect(daysUntilBirthday("03-15", "2026-03-16")).toBe(364);
    expect(ageOnNextBirthday("1990-03-15", "2026-03-10")).toBe(36);
    expect(birthdayLabel("1990-03-15")).toBe("15 de marzo");
  });
});
