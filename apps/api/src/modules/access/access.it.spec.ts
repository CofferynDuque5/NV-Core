import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { WorkspaceAccessService } from "../../common/access/workspace-access.service";
import { ReceiptStore } from "../../common/receipts/receipt-store.service";
import { NotificationsService } from "../notifications/notifications.module";
import { PaymentsService } from "../payments/payments.module";
import { AccessService } from "./access.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Prueba gratis de 24 h y pago manual del plan contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const log: string[] = [];
  const audit = { record: async (_ws: string, _a: string, action: string) => void log.push(action) };
  const notifications = new NotificationsService(prisma as never);
  const stamp = Date.now();
  const operator = `it-nv-cobros-${stamp}`;
  const billing = {
    trialHours: 24,
    operatorWorkspace: operator,
    plan: { price: 19, currency: "USD", days: 30 },
    basicPrice: 7,
    receiptsDir: mkdtempSync(join(tmpdir(), "nv-receipts-")),
  };
  const config = { get: () => billing };
  const access = new WorkspaceAccessService(prisma as never, config as never);
  const receipts = new ReceiptStore(config as never);
  const rates = { current: async () => ({ rate: 40, source: "manual" as const, at: new Date().toISOString() }) };
  const payments = new PaymentsService(
    prisma as never,
    audit as never,
    notifications as never,
    access,
    config as never,
    receipts,
    rates as never,
  );
  const registry = { resolve: async (slug: string) => ({ slug, name: "Café Luna" }) };
  const service = new AccessService(prisma as never, config as never, access, registry as never, payments, rates as never);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const today = new Date().toISOString().slice(0, 10);
  const payer = (extra: Record<string, string> = {}) =>
    JSON.stringify({ payerName: "Ana Luna", paidOn: today, amountPaid: "19 USDT", payerAccount: "ana-bnb", ...extra });
  const pay = (ws: string, actor: string, methodId: string, reference: string, receipt: Buffer | null = png, extra = {}) =>
    service.pay(ws, actor, { methodId, reference, payer: payer(extra) }, receipt ?? undefined);

  it("una marca nueva empieza 24 h de prueba; una sin fila no tiene límite", async () => {
    const ws = `it-trial-a-${stamp}`;
    const before = Date.now();
    await access.startTrial(ws);
    const s = await access.state(ws);
    expect(s.state).toBe("trial");
    const ends = new Date(s.trialEndsAt!).getTime();
    expect(ends - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
    expect(ends - before).toBeLessThanOrEqual(24 * 3_600_000 + 5000);
    expect((await access.state(`it-sin-fila-${stamp}`)).state).toBe("unlimited");
    // Starting it again never restarts the clock.
    await prisma.workspaceAccess.update({ where: { workspaceSlug: ws }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await access.startTrial(ws);
    expect((await access.state(ws, new Date())).state).not.toBe("trial");
  });

  it("al vencer muestra el precio y los métodos activos del operador, y el pago pasa por Cobros", async () => {
    const ws = `it-trial-b-${stamp}`;
    await prisma.workspaceAccess.create({ data: { workspaceSlug: ws, trialEndsAt: new Date(Date.now() - 60_000) } });
    const binance = await payments.createMethod(operator, "dueño@nv.co", {
      kind: "binance_pay",
      label: "Binance Pay NV",
      currency: "USDT",
      details: { payId: "123456789" },
    });
    const off = await payments.createMethod(operator, "dueño@nv.co", {
      kind: "zinli",
      label: "Zinli viejo",
      currency: "USD",
      details: { email: "nv@zinli.com", holder: "NV" },
      active: false,
    });

    const view = await service.overview(ws);
    expect(view.state).toBe("expired");
    expect(view.plan).toEqual({ price: 19, currency: "USD", days: 30 });
    expect(view.methods.map((m) => m.id)).toEqual([binance.id]);
    expect(view.payment).toBeUndefined();

    await expect(pay(ws, "ana@luna.co", off.id, "ABC123")).rejects.toThrow(/no está disponible/);
    // The receipt is required, and must really be an image or a PDF.
    await expect(pay(ws, "ana@luna.co", binance.id, "ABC123", null)).rejects.toThrow(/comprobante/);
    await expect(pay(ws, "ana@luna.co", binance.id, "ABC123", Buffer.from("<html><script>"))).rejects.toThrow(/imagen/);
    // So are the payer details this method asks for.
    await expect(pay(ws, "ana@luna.co", binance.id, "ABC123", png, { payerAccount: "" })).rejects.toThrow(/Falta/);
    const sent = await pay(ws, "ana@luna.co", binance.id, "ABC123");
    expect(sent.payment).toMatchObject({ status: "por_verificar", amount: 19, currency: "USD", reference: "ABC123", methodLabel: "Binance Pay NV" });
    await expect(pay(ws, "ana@luna.co", binance.id, "XYZ999")).rejects.toThrow(/estamos verificando/);
    const stored = await prisma.paymentRequest.findFirstOrThrow({ where: { forWorkspace: ws } });
    expect(stored.payer).toMatchObject({ payerName: "Ana Luna", payerAccount: "ana-bnb" });
    expect(stored.receiptFile).toMatch(/^[a-f0-9]{32}\.png$/);
    expect((await payments.planPaymentReceipt(operator, stored.id)).type).toBe("image/png");

    // The operator team gets the usual «Por verificar» notice in its own brand.
    const notes = await prisma.notification.findMany({ where: { workspaceSlug: operator } });
    expect(notes.some((n) => n.title.includes("Café Luna"))).toBe(true);
    // Nothing is opened until someone checks the money arrived.
    expect((await access.state(ws)).state).toBe("expired");

    const row = await prisma.paymentRequest.findFirstOrThrow({ where: { forWorkspace: ws } });
    await payments.update(operator, "dueño@nv.co", row.id, { status: "pagado" });
    const after = await service.overview(ws);
    expect(after.state).toBe("active");
    expect(after.payment?.status).toBe("pagado");
    const days = (new Date(after.paidUntil!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(log).toContain("access.activate");
  });

  it("una referencia que ya confirmó otro pago se rechaza", async () => {
    const ws = `it-trial-c-${stamp}`;
    await prisma.workspaceAccess.create({ data: { workspaceSlug: ws, trialEndsAt: new Date(Date.now() - 60_000) } });
    const [method] = await payments.methods(operator);
    await expect(pay(ws, "leo@otra.co", method!.id, "abc123")).rejects.toThrow(/ya confirmó/);
  });

  it("Pago Móvil en bolívares guarda el monto en Bs a la tasa USDT y el admin lo aprueba", async () => {
    const ws = `it-trial-ve-${stamp}`;
    await prisma.workspaceAccess.create({ data: { workspaceSlug: ws, trialEndsAt: new Date(Date.now() - 60_000) } });
    const pm = await payments.createMethod(operator, "dueño@nv.co", {
      kind: "pago_movil",
      label: "Pago Móvil BDV",
      currency: "VES",
      details: { bank: "Banco de Venezuela (0102)", phone: "04120000000", docId: "V1", holder: "NV" },
    });
    expect((await service.overview(ws)).vesRate?.rate).toBe(40);
    const sent = await service.pay(
      ws,
      "ve@luna.co",
      {
        planId: "basico",
        methodId: pm.id,
        reference: "PM-778899",
        payer: JSON.stringify({ payerName: "Ana", payerBank: "Banesco", payerPhone: "04141112233", payerDoc: "V-123", paidOn: today, amountPaid: "280 Bs" }),
      },
      png,
    );
    expect(sent.payment).toMatchObject({ amount: 7, localAmount: 280, localCurrency: "VES", planId: "basico" });
    const row = await prisma.paymentRequest.findFirstOrThrow({ where: { forWorkspace: ws } });
    const review = await payments.reviewPlanPayment(operator, "admin@nv.co", row.id, { approve: true });
    expect(review.status).toBe("pagado");
    expect(await access.planId(ws)).toBe("basico");
    // Básico doesn't open the Pro extras.
    expect(await access.allows(ws, "tienda")).toBe(false);
    expect(await access.allows(ws, "automatizaciones")).toBe(false);
  });

  it("una prueba por persona y por dispositivo, y un solo envío de campaña", async () => {
    const first = `it-dev-a-${stamp}`;
    const device = `dev${stamp}abcdefghijklmnop`;
    expect((await access.startTrial(first, { userId: `u1-${stamp}`, deviceId: device, ip: "1.2.3.4" })).denied).toBe(false);
    // Another account on the same browser: no trial.
    const second = `it-dev-b-${stamp}`;
    expect((await access.startTrial(second, { userId: `u2-${stamp}`, deviceId: device, ip: "5.6.7.8" })).denied).toBe(true);
    expect((await access.state(second)).state).toBe("expired");
    expect((await service.overview(second)).trialDenied).toBe(true);
    // Same account, new browser: no trial either (even after deleting the brand).
    expect((await access.startTrial(`it-dev-c-${stamp}`, { userId: `u1-${stamp}` })).denied).toBe(true);

    expect(await access.claimTrialSend(first)).toBe("claimed");
    expect(await access.claimTrialSend(first)).toBe("used");
    expect(await access.trialSendTaken(first)).toBe(true);
    await access.endTrial(first);
    expect((await access.state(first)).state).toBe("expired");
    expect((await service.overview(first)).trialSendUsed).toBe(true);
  });

  it("sin marca de cobro configurada, no deja enviar pagos", async () => {
    const ws = `it-trial-d-${stamp}`;
    await prisma.workspaceAccess.create({ data: { workspaceSlug: ws, trialEndsAt: new Date(Date.now() - 60_000) } });
    const bare = new AccessService(
      prisma as never,
      { get: () => ({ ...billing, operatorWorkspace: "" }) } as never,
      access,
      registry as never,
      payments,
      rates as never,
    );
    expect((await bare.overview(ws)).methods).toEqual([]);
    await expect(bare.pay(ws, "x@y.co", { methodId: "m", reference: "REF1", payer: payer() }, png)).rejects.toThrow(/aún no está configurado/);
  });
});
