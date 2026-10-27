import { describe, expect, it } from "vitest";

import { lastClosedWeek, mergePaymentTotals, noticeMeta, parseWeekStart, rankLeadSources, weekLabel, weekStartOf } from "./weekly-report";

describe("semanas (lunes a domingo, UTC)", () => {
  it("encuentra el lunes de cualquier día, incluido el domingo", () => {
    expect(weekStartOf(new Date("2026-10-21T10:00:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(weekStartOf(new Date("2026-10-25T23:59:59Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(weekStartOf(new Date("2026-10-26T00:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("la última semana cerrada es la anterior a la actual", () => {
    expect(lastClosedWeek(new Date("2026-10-26T00:30:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(lastClosedWeek(new Date("2026-10-25T22:00:00Z")).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("solo acepta lunes con formato AAAA-MM-DD", () => {
    expect(parseWeekStart("2026-10-19")?.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(parseWeekStart("2026-10-20")).toBeNull();
    expect(parseWeekStart("2026-02-30")).toBeNull();
    expect(parseWeekStart("19/10/2026")).toBeNull();
  });

  it("nombra la semana aunque cruce de mes", () => {
    expect(weekLabel("2026-10-19", "2026-10-25")).toBe("19 al 25 de oct.");
    expect(weekLabel("2026-10-26", "2026-11-01")).toBe("26 de oct. al 1 de nov.");
  });
});

describe("orígenes de leads", () => {
  it("ordena, agrupa el resto en «otros» y deja «sin origen» al final", () => {
    const rows = [
      { source: null, n: 4 },
      { source: "a", n: 1 },
      { source: "b", n: 9 },
      { source: "c", n: 3 },
      { source: "d", n: 2 },
      { source: "e", n: 2 },
      { source: "f", n: 1 },
    ];
    expect(rankLeadSources(rows)).toEqual([
      { source: "b", count: 9 },
      { source: "c", count: 3 },
      { source: "d", count: 2 },
      { source: "e", count: 2 },
      { source: "a", count: 1 },
      { source: "otros", count: 1 },
      { source: null, count: 4 },
    ]);
  });
});

describe("texto del aviso", () => {
  const base = {
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    metrics: [{ key: "contacts", label: "Contactos nuevos", value: 12, previous: 9, source: "" }],
    attention: [],
  };
  it("resume contactos con la diferencia y lo pendiente", () => {
    expect(noticeMeta(base)).toBe("Semana del 19 al 25 de oct. · 12 contactos nuevos (+3) · nada pendiente");
    expect(
      noticeMeta({
        ...base,
        metrics: [{ ...base.metrics[0]!, previous: 12 }],
        attention: [{ key: "x", label: "x", count: 1, section: "tareas", items: [] }],
      }),
    ).toBe("Semana del 19 al 25 de oct. · 12 contactos nuevos · 1 asunto pendiente");
  });

  it("cuenta los cobros confirmados, sin sumar monedas", () => {
    const pay = { amount: 1, previousAmount: 0, previousCount: 0 };
    expect(
      noticeMeta({
        ...base,
        payments: [
          { ...pay, currency: "COP", count: 2 },
          { ...pay, currency: "USDT", count: 1 },
        ],
      }),
    ).toBe("Semana del 19 al 25 de oct. · 12 contactos nuevos (+3) · 3 cobros confirmados · nada pendiente");
    expect(noticeMeta({ ...base, payments: [{ ...pay, currency: "PEN", count: 1 }] })).toContain("1 cobro confirmado ·");
  });
});

describe("cobros por moneda", () => {
  it("junta la semana y la anterior por moneda, en orden fijo, sin convertir", () => {
    const decimal = (s: string) => ({ toString: () => s });
    expect(
      mergePaymentTotals(
        [
          { currency: "USDT", amount: decimal("25.50"), count: 1 },
          { currency: "COP", amount: decimal("200000.00"), count: 2 },
        ],
        [
          { currency: "PEN", amount: decimal("49.90"), count: 1 },
          { currency: "COP", amount: 100000, count: 1 },
        ],
      ),
    ).toEqual([
      { currency: "COP", amount: 200000, count: 2, previousAmount: 100000, previousCount: 1 },
      { currency: "PEN", amount: 0, count: 0, previousAmount: 49.9, previousCount: 1 },
      { currency: "USDT", amount: 25.5, count: 1, previousAmount: 0, previousCount: 0 },
    ]);
    expect(mergePaymentTotals([], [])).toEqual([]);
    expect(mergePaymentTotals([{ currency: "COP", amount: null, count: 0 }], [])[0]?.amount).toBe(0);
  });
});
