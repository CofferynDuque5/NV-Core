import { describe, expect, it } from "vitest";
import { formatPaymentAmount, paymentInstructions, paymentMethodLine } from "@nv/domain";

import { cleanDetails } from "./payments.module";

describe("datos de un método de cobro", () => {
  it("guarda solo los campos del tipo, sin espacios", () => {
    expect(cleanDetails("nequi", { phone: " 300 123 4567 ", holder: "Ana Ruiz", hack: "<script>" })).toEqual({
      phone: "300 123 4567",
      holder: "Ana Ruiz",
    });
  });

  it("exige los obligatorios de cada tipo", () => {
    expect(() => cleanDetails("pago_movil", { bank: "Banesco (0134)", phone: "0414-1234567", holder: "Ana" })).toThrow(
      /Documento/,
    );
    expect(() => cleanDetails("usdt", { network: "TRC20 (Tron)" })).toThrow(/Dirección/);
    expect(() => cleanDetails("binance_pay", { payId: 12345 as unknown as string })).toThrow(/texto/);
    expect(cleanDetails("otro", {})).toEqual({});
  });
});

describe("instrucciones para el cliente", () => {
  it("formatea montos por moneda", () => {
    expect(formatPaymentAmount(150000, "COP")).toBe("$ 150.000 COP");
    expect(formatPaymentAmount(49.9, "PEN")).toBe("S/ 49,90");
    expect(formatPaymentAmount(1250.5, "VES")).toBe("Bs. 1.250,50");
    expect(formatPaymentAmount(25, "USDT")).toBe("25,00 USDT");
  });

  it("arma el mensaje con el monto, los métodos y cómo avisar el pago", () => {
    const text = paymentInstructions({
      contactName: "Lucía",
      concept: "Plan mensual",
      amount: 25,
      currency: "USDT",
      methods: [
        { kind: "binance_pay", label: "Binance", details: { payId: "123456789" }, instructions: "Indica tu usuario en la nota." },
        { kind: "usdt", label: "USDT TRC20", details: { network: "TRC20 (Tron)", address: "TXyz" } },
      ],
    });
    expect(text).toContain("Hola Lucía, para pagar «Plan mensual» el valor es 25,00 USDT.");
    expect(text).toContain("• Binance · Binance Pay ID: 123456789 · Indica tu usuario en la nota.");
    expect(text).toContain("• USDT TRC20 · Red: TRC20 (Tron) · Dirección: TXyz");
    expect(text).toContain("captura del comprobante");
  });

  it("omite campos vacíos", () => {
    expect(paymentMethodLine({ kind: "yape", label: "Yape", details: { phone: "987654321", holder: "" } })).toBe(
      "Yape · Número de celular: 987654321",
    );
  });
});
