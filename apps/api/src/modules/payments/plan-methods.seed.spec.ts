import { describe, expect, it } from "vitest";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { cleanQrImage } from "./payments.module";
import { parsePlanMethods, qrFromFile } from "./plan-methods.seed";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

describe("parsePlanMethods", () => {
  it("keeps known kinds with their fields and fills label and currency", () => {
    const out = parsePlanMethods([
      {
        kind: "pago_movil",
        details: {
          bank: "Banco de Venezuela (0102)",
          phone: "04120000000",
          docId: "V-1",
          junk: "x",
        },
      },
      { kind: "zinli", details: { email: "pagos@example.com" } },
      { kind: "binance_pay", label: "Binance", details: { payId: "123" } },
    ]);
    expect(out).toEqual([
      {
        kind: "pago_movil",
        label: "Pago Móvil",
        currency: "VES",
        details: { bank: "Banco de Venezuela (0102)", phone: "04120000000", docId: "V-1" },
      },
      { kind: "zinli", label: "Zinli", currency: "USD", details: { email: "pagos@example.com" } },
      { kind: "binance_pay", label: "Binance", currency: "USDT", details: { payId: "123" } },
    ]);
  });

  it("drops unknown kinds, empty details and anything that isn't a list", () => {
    expect(
      parsePlanMethods([
        { kind: "paypal", details: { email: "a" } },
        { kind: "zinli", details: { email: " " } },
      ]),
    ).toEqual([]);
    expect(parsePlanMethods({ kind: "zinli" })).toEqual([]);
  });

  it("adds the QR picture named in qrFile, only as a plain file name", () => {
    const read = (name: string) => (name === "zinli-qr.png" ? "data:image/png;base64,AAAA" : null);
    const out = parsePlanMethods(
      [
        { kind: "zinli", details: { email: "a@b.co", qr: "texto" }, qrFile: "zinli-qr.png" },
        { kind: "binance_pay", details: { payId: "1" }, qrFile: "../secreto.png" },
      ],
      read,
    );
    expect(out[0]!.details).toEqual({ email: "a@b.co", qr: "data:image/png;base64,AAAA" });
    expect(out[1]!.details).toEqual({ payId: "1" });
  });
});

describe("QR de un método", () => {
  it("lee una imagen real y rechaza lo que no lo es", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qr-"));
    writeFileSync(path.join(dir, "ok.png"), PNG);
    writeFileSync(path.join(dir, "no.png"), "<svg onload=alert(1)>");
    expect(qrFromFile(path.join(dir, "ok.png"))).toBe(
      `data:image/png;base64,${PNG.toString("base64")}`,
    );
    expect(qrFromFile(path.join(dir, "no.png"))).toBeNull();
    expect(qrFromFile(path.join(dir, "falta.png"))).toBeNull();
  });

  it("solo acepta data URLs PNG/JPG/WebP cuyo contenido coincide", () => {
    const ok = `data:image/png;base64,${PNG.toString("base64")}`;
    expect(cleanQrImage(ok)).toBe(ok);
    expect(() => cleanQrImage(`data:image/jpeg;base64,${PNG.toString("base64")}`)).toThrow();
    expect(() => cleanQrImage("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => cleanQrImage("https://evil.example/qr.png")).toThrow();
  });
});
