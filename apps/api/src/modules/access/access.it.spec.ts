import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { WorkspaceAccessService } from "../../common/access/workspace-access.service";
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
  const billing = { trialHours: 24, operatorWorkspace: operator, plan: { price: 19, currency: "USD", days: 30 } };
  const config = { get: () => billing };
  const access = new WorkspaceAccessService(prisma as never, config as never);
  const payments = new PaymentsService(prisma as never, audit as never, notifications as never, access, config as never);
  const registry = { resolve: async (slug: string) => ({ slug, name: "Café Luna" }) };
  const service = new AccessService(prisma as never, config as never, access, registry as never, payments);

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

    await expect(service.pay(ws, "ana@luna.co", { methodId: off.id, reference: "ABC123" })).rejects.toThrow(/no está disponible/);
    const sent = await service.pay(ws, "ana@luna.co", { methodId: binance.id, reference: "ABC123", note: "pagué hoy" });
    expect(sent.payment).toMatchObject({ status: "por_verificar", amount: 19, currency: "USD", reference: "ABC123", methodLabel: "Binance Pay NV" });
    await expect(service.pay(ws, "ana@luna.co", { methodId: binance.id, reference: "XYZ999" })).rejects.toThrow(/estamos verificando/);

    // The operator team gets the usual «Por verificar» notice in its own brand.
    const notes = await prisma.notification.findMany({ where: { workspaceSlug: operator } });
    expect(notes.some((n) => n.title.includes("Plan Café Luna"))).toBe(true);
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
    await expect(service.pay(ws, "leo@otra.co", { methodId: method!.id, reference: "abc123" })).rejects.toThrow(/ya confirmó/);
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
    );
    expect((await bare.overview(ws)).methods).toEqual([]);
    await expect(bare.pay(ws, "x@y.co", { methodId: "m", reference: "REF1" })).rejects.toThrow(/aún no está configurado/);
  });
});
