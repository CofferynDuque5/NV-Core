import { describe, expect, it } from "vitest";

import { parsePlanMethods } from "./plan-methods.seed";

describe("parsePlanMethods", () => {
  it("keeps known kinds with their fields and fills label and currency", () => {
    const out = parsePlanMethods([
      { kind: "pago_movil", details: { bank: "Banco de Venezuela (0102)", phone: "04120000000", docId: "V-1", junk: "x" } },
      { kind: "zinli", details: { email: "pagos@example.com" } },
      { kind: "binance_pay", label: "Binance", details: { payId: "123" } },
    ]);
    expect(out).toEqual([
      { kind: "pago_movil", label: "Pago Móvil", currency: "VES", details: { bank: "Banco de Venezuela (0102)", phone: "04120000000", docId: "V-1" } },
      { kind: "zinli", label: "Zinli", currency: "USD", details: { email: "pagos@example.com" } },
      { kind: "binance_pay", label: "Binance", currency: "USDT", details: { payId: "123" } },
    ]);
  });

  it("drops unknown kinds, empty details and anything that isn't a list", () => {
    expect(parsePlanMethods([{ kind: "paypal", details: { email: "a" } }, { kind: "zinli", details: { email: " " } }])).toEqual([]);
    expect(parsePlanMethods({ kind: "zinli" })).toEqual([]);
  });
});
