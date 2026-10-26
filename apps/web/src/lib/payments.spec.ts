import { describe, expect, it } from "vitest";
import type { PaymentMethod, PaymentRequest } from "@nv/domain";

import { collectedThisMonth, isOverdue, methodsByCountry, methodsFor, statusCounts } from "./payments";

const method = (id: string, kind: PaymentMethod["kind"], currency: PaymentMethod["currency"], active = true): PaymentMethod => ({
  id,
  kind,
  label: id,
  currency,
  details: {},
  active,
  createdAt: "2026-10-01T00:00:00.000Z",
});

const pay = (over: Partial<PaymentRequest>): PaymentRequest => ({
  id: "p",
  concept: "x",
  amount: 10,
  currency: "COP",
  status: "pendiente",
  createdBy: "a",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("cobros", () => {
  const methods = [method("bin", "binance_pay", "USDT"), method("yape", "yape", "PEN"), method("neq", "nequi", "COP"), method("pm", "pago_movil", "VES", false)];

  it("agrupa los métodos por país en orden fijo", () => {
    expect(methodsByCountry(methods).map((g) => [g.label, g.methods.map((m) => m.id)])).toEqual([
      ["Colombia", ["neq"]],
      ["Venezuela", ["pm"]],
      ["Perú", ["yape"]],
      ["Internacional", ["bin"]],
    ]);
  });

  it("ofrece solo métodos activos en la moneda del cobro", () => {
    expect(methodsFor(methods, "COP").map((m) => m.id)).toEqual(["neq"]);
    expect(methodsFor(methods, "VES")).toEqual([]);
  });

  it("cuenta por estado y suma lo cobrado del mes sin mezclar monedas", () => {
    const now = new Date("2026-10-26T12:00:00");
    const list = [
      pay({ status: "pagado", amount: 150000, paidAt: "2026-10-05T10:00:00" }),
      pay({ status: "pagado", amount: 50000.5, paidAt: "2026-10-20T10:00:00" }),
      pay({ status: "pagado", amount: 25, currency: "USDT", paidAt: "2026-10-21T10:00:00" }),
      pay({ status: "pagado", amount: 999, paidAt: "2026-09-30T10:00:00" }),
      pay({ status: "por_verificar" }),
    ];
    expect(statusCounts(list)).toMatchObject({ pagado: 4, por_verificar: 1, pendiente: 0 });
    expect(collectedThisMonth(list, now)).toEqual([
      { currency: "COP", amount: 200000.5 },
      { currency: "USDT", amount: 25 },
    ]);
  });

  it("marca vencidos solo los que siguen sin pagar", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(isOverdue(pay({ dueAt: "2026-10-20T12:00:00Z" }), now)).toBe(true);
    expect(isOverdue(pay({ dueAt: "2026-10-20T12:00:00Z", status: "por_verificar" }), now)).toBe(false);
    expect(isOverdue(pay({ dueAt: "2026-10-30T12:00:00Z" }), now)).toBe(false);
  });
});
