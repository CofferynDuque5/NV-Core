import { describe, expect, it } from "vitest";

import { medianP2pPrice } from "../../common/fx/usdt-rate.service";
import { RECEIPT_NAME_RE, sniffReceipt } from "../../common/receipts/receipt-store.service";
import { alertLines } from "./plan-payment-alerts";
import { cleanPayer } from "./payments.module";

describe("tasa USDT de Binance P2P", () => {
  it("toma la mediana de las ofertas y descarta basura", () => {
    const body = {
      data: [
        { adv: { price: "41.5" } },
        { adv: { price: "40" } },
        { adv: { price: "x" } },
        { adv: { price: "39" } },
      ],
    };
    expect(medianP2pPrice(body)).toBe(40);
    expect(medianP2pPrice({ data: [{ adv: { price: "40" } }, { adv: { price: "42" } }] })).toBe(41);
    expect(medianP2pPrice({ data: [] })).toBeUndefined();
    expect(medianP2pPrice(null)).toBeUndefined();
  });
});

describe("comprobantes", () => {
  it("reconoce el tipo real por los primeros bytes", () => {
    expect(sniffReceipt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffReceipt(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
    expect(sniffReceipt(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffReceipt(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffReceipt(Buffer.from("<svg onload=alert(1)>"))).toBeUndefined();
    expect(sniffReceipt(Buffer.from("<html>"))).toBeUndefined();
  });

  it("solo lee nombres generados por el servidor (sin rutas)", () => {
    expect(RECEIPT_NAME_RE.test("0123456789abcdef0123456789abcdef.png")).toBe(true);
    expect(RECEIPT_NAME_RE.test("../../etc/passwd")).toBe(false);
    expect(RECEIPT_NAME_RE.test("0123456789abcdef0123456789abcdef.html")).toBe(false);
  });
});

describe("datos del pago", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  it("pide lo que corresponde al método y descarta campos ajenos", () => {
    const payer = cleanPayer(
      "pago_movil",
      {
        payerName: " Ana ",
        payerBank: "Banesco",
        payerPhone: "0414",
        payerDoc: "V-1",
        paidOn: "2026-10-31",
        amountPaid: "280 Bs",
        evil: "<x>",
      },
      now,
    );
    expect(payer).toEqual({
      payerName: "Ana",
      payerBank: "Banesco",
      payerPhone: "0414",
      payerDoc: "V-1",
      paidOn: "2026-10-31",
      amountPaid: "280 Bs",
    });
    expect(() =>
      cleanPayer("pago_movil", { payerName: "Ana", paidOn: "2026-10-31", amountPaid: "1" }, now),
    ).toThrow(/Falta/);
  });

  it("rechaza fechas futuras, viejas o inválidas", () => {
    const base = { payerName: "Ana", payerAccount: "x", amountPaid: "7" };
    expect(() => cleanPayer("zinli", { ...base, paidOn: "2026-11-05" }, now)).toThrow(/futura/);
    expect(() => cleanPayer("zinli", { ...base, paidOn: "2026-07-01" }, now)).toThrow(/60 días/);
    expect(() => cleanPayer("zinli", { ...base, paidOn: "ayer" }, now)).toThrow(/no es válida/);
    expect(() => cleanPayer("zinli", { ...base, paidOn: "2026-10-30", payerName: 5 }, now)).toThrow(
      /texto/,
    );
  });

  it("el aviso al operador lleva marca, plan, monto en Bs, referencia y datos del pagador", () => {
    const lines = alertLines({
      id: "p1",
      forWorkspace: "cafe-luna",
      forName: "Café Luna",
      planId: "basico",
      amount: 7,
      currency: "USD",
      localAmount: 280,
      localCurrency: "VES",
      rate: 40,
      methodKind: "pago_movil",
      methodLabel: "Pago Móvil BDV",
      reference: "778899",
      payer: {
        payerName: "Ana",
        payerBank: "Banesco",
        payerPhone: "0414",
        payerDoc: "V-1",
        paidOn: "2026-10-31",
        amountPaid: "280 Bs",
      },
      sentBy: "ana@luna.co",
    }).join("\n");
    expect(lines).toContain("Café Luna (cafe-luna)");
    expect(lines).toContain("Plan Básico");
    expect(lines).toContain("40 Bs/USDT");
    expect(lines).toContain("Referencia: 778899");
    expect(lines).toContain("Banco desde el que pagaste: Banesco");
  });
});
