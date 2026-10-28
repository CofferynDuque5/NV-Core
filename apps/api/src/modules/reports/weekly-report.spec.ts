import { describe, expect, it } from "vitest";

import {
  lastClosedLocalWeek,
  localDayKey,
  localWeekStart,
  shortDay,
  weekBounds,
  zonedMidnight,
  lastClosedWeek,
  mergePaymentTotals, noticeMeta, parseWeekStart, phoneKey, rankLeadSources, summarizeInbox, weekLabel, weekStartOf,
  type InboxConversationRow } from "./weekly-report";

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

describe("semanas con la hora de la marca", () => {
  it("la medianoche local de Bogotá, Caracas y Lima cae en su hora UTC", () => {
    expect(zonedMidnight("2026-10-19", "America/Bogota").toISOString()).toBe("2026-10-19T05:00:00.000Z");
    expect(zonedMidnight("2026-10-19", "America/Caracas").toISOString()).toBe("2026-10-19T04:00:00.000Z");
    expect(zonedMidnight("2026-10-19", "America/Lima").toISOString()).toBe("2026-10-19T05:00:00.000Z");
    expect(zonedMidnight("2026-10-19", "UTC").toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("respeta el cambio de horario donde lo hay (Madrid, 25 oct 2026)", () => {
    expect(zonedMidnight("2026-10-19", "Europe/Madrid").toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(zonedMidnight("2026-10-26", "Europe/Madrid").toISOString()).toBe("2026-10-25T23:00:00.000Z");
    // That week is one hour longer than 7 days.
    const { from, to } = weekBounds(new Date("2026-10-19T00:00:00Z"), "Europe/Madrid");
    expect(to.getTime() - from.getTime()).toBe(7 * 86_400_000 + 3_600_000);
  });

  it("el domingo 8 pm en Bogotá sigue siendo domingo (en UTC ya es lunes)", () => {
    const sundayNight = new Date("2026-10-26T01:00:00Z"); // 25 oct, 20:00 en Bogotá
    expect(localDayKey(sundayNight, "America/Bogota")).toBe("2026-10-25");
    expect(localWeekStart(sundayNight, "America/Bogota").toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(localWeekStart(sundayNight, "UTC").toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // So the week of the 19th is not closed yet in Bogotá, but it is in UTC.
    expect(lastClosedLocalWeek(sundayNight, "America/Bogota").toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(lastClosedLocalWeek(sundayNight, "UTC").toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(shortDay(sundayNight, "America/Bogota")).toBe("25/10");
  });

  it("la semana en Caracas va del lunes 04:00 UTC al lunes siguiente", () => {
    expect(weekBounds(new Date("2026-10-19T00:00:00Z"), "America/Caracas")).toEqual({
      from: new Date("2026-10-19T04:00:00Z"),
      to: new Date("2026-10-26T04:00:00Z"),
    });
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

describe("summarizeInbox", () => {
  const at = (iso: string) => new Date(iso);
  const row = (o: Partial<InboxConversationRow> & { createdAt: Date }): InboxConversationRow => ({
    channel: "wa",
    contactHandle: null,
    firstIn: o.createdAt,
    firstOut: null,
    ...o,
  });

  it("counts answers and the median first-reply time", () => {
    const s = summarizeInbox({
      rows: [
        row({ createdAt: at("2026-10-19T10:00:00Z"), firstOut: at("2026-10-19T10:10:00Z") }),
        row({ createdAt: at("2026-10-19T11:00:00Z"), firstOut: at("2026-10-19T11:30:00Z") }),
        row({ createdAt: at("2026-10-19T12:00:00Z"), firstOut: at("2026-10-19T12:20:00Z"), channel: "ig" }),
        row({ createdAt: at("2026-10-19T13:00:00Z") }),
      ],
      previousRows: [row({ createdAt: at("2026-10-12T10:00:00Z") })],
      messagesIn: 9,
      sendTimes: [],
      formPhones: new Set(),
    });
    expect(s).toMatchObject({ conversations: 4, previousConversations: 1, answered: 3, medianReplyMinutes: 20, messagesIn: 9 });
    expect(s.byChannel).toEqual([
      { channel: "wa", count: 3 },
      { channel: "ig", count: 1 },
    ]);
  });

  it("credits the panel within 48 h after a confirmed send, or for a form contact, counting each once", () => {
    const s = summarizeInbox({
      rows: [
        // 47 h after the send → after a campaign.
        row({ createdAt: at("2026-10-21T11:00:00Z") }),
        // 49 h after → not.
        row({ createdAt: at("2026-10-21T13:00:00Z") }),
        // Before any send, but the phone came from a form ("0412…" vs "+58 412…").
        row({ createdAt: at("2026-10-18T09:00:00Z"), contactHandle: "+58 412 555 1234" }),
        // Both: counted once in fromPanel.
        row({ createdAt: at("2026-10-19T13:00:00Z"), contactHandle: "04125551234" }),
      ],
      previousRows: [row({ createdAt: at("2026-10-19T14:00:00Z") })],
      messagesIn: 0,
      sendTimes: [at("2026-10-19T12:00:00Z")],
      formPhones: new Set([phoneKey("0412-555-1234")!]),
    });
    expect(s).toMatchObject({ afterCampaign: 2, fromForms: 2, fromPanel: 3, previousFromPanel: 1, medianReplyMinutes: null });
  });

  it("ignores handles that are not phones", () => {
    expect(phoneKey("@mi.tienda")).toBeNull();
    expect(phoneKey("123")).toBeNull();
    expect(phoneKey("+57 300 123 4567")).toBe("3001234567");
  });
});
