import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PaymentsService } from "./payments.module";
import { NotificationsService } from "../notifications/notifications.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Cobros manuales contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const log: string[] = [];
  const audit = { record: async (_ws: string, _a: string, action: string) => void log.push(action) };
  const notifications = new NotificationsService(prisma as never);
  const payments = new PaymentsService(prisma as never, audit as never, notifications as never);
  const me = "caja@nv.tv";

  it("crea métodos por país y los guarda limpios", async () => {
    const ws = `it-pay-m-${Date.now()}`;
    const nequi = await payments.createMethod(ws, me, {
      kind: "nequi",
      label: "Nequi Ana",
      currency: "COP",
      details: { phone: "300 123 4567", holder: "Ana Ruiz", extra: "x" },
    });
    expect(nequi.details).toEqual({ phone: "300 123 4567", holder: "Ana Ruiz" });
    await expect(
      payments.createMethod(ws, me, { kind: "zinli", label: "Zinli", currency: "USD", details: {} }),
    ).rejects.toThrow(/Falta: Correo o celular de Zinli/);
    const off = await payments.updateMethod(ws, me, nequi.id, { active: false });
    expect(off.active).toBe(false);
    expect(await payments.methods(`${ws}-otro`)).toEqual([]);
    await expect(payments.removeMethod(`${ws}-otro`, me, nequi.id)).rejects.toThrow(/no encontrado/);
  });

  it("sigue el ciclo pendiente → por verificar → pagado y guarda quién lo confirmó", async () => {
    const ws = `it-pay-c-${Date.now()}`;
    const contact = await prisma.contact.create({ data: { workspaceSlug: ws, name: "Lucía" } });
    const yape = await payments.createMethod(ws, me, {
      kind: "yape",
      label: "Yape",
      currency: "PEN",
      details: { phone: "987654321", holder: "Ana" },
    });
    const p = await payments.create(ws, me, { concept: " Plan mensual ", amount: 49.9, currency: "PEN", contactId: contact.id });
    expect(p).toMatchObject({ concept: "Plan mensual", amount: 49.9, status: "pendiente", contactName: "Lucía" });

    const claimed = await payments.update(ws, me, p.id, { status: "por_verificar", methodId: yape.id, reference: "YP-881" });
    expect(claimed).toMatchObject({ status: "por_verificar", methodLabel: "Yape", reference: "YP-881" });
    // The whole team is told in-app that someone has to check the account.
    const notices = await prisma.notification.findMany({ where: { workspaceSlug: ws } });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: "warning",
      recipient: null,
      title: "Cobro por verificar: Plan mensual",
      meta: "Lucía · S/ 49,90 · Yape · ref YP-881 · Revisa la cuenta y confírmalo en Cobros.",
    });
    // Editing it while it waits does not notify again.
    await payments.update(ws, me, p.id, { note: "Mandó captura" });
    expect(await prisma.notification.count({ where: { workspaceSlug: ws } })).toBe(1);

    const paid = await payments.update(ws, "admin@nv.tv", p.id, { status: "pagado" });
    expect(paid.status).toBe("pagado");
    expect(paid.verifiedBy).toBe("admin@nv.tv");
    expect(paid.paidAt).toBeDefined();
    expect(log).toEqual(expect.arrayContaining(["payment.create", "payment.por_verificar", "payment.pagado"]));

    // Closed: no edits, no jumps; only an audited reopen.
    await expect(payments.update(ws, me, p.id, { note: "x" })).rejects.toThrow(/cerrado/);
    await expect(payments.update(ws, me, p.id, { status: "cancelado" })).rejects.toThrow(/no puede pasar/);
    const reopened = await payments.update(ws, me, p.id, { status: "por_verificar" });
    expect(reopened.paidAt).toBeUndefined();
    expect(reopened.verifiedBy).toBeUndefined();
    // Reopening a confirmed payment asks for a new check.
    expect(await prisma.notification.count({ where: { workspaceSlug: ws } })).toBe(2);

    expect((await payments.list(ws, { contactId: contact.id })).map((x) => x.id)).toEqual([p.id]);
    expect(await payments.list(ws, { status: "pagado" })).toEqual([]);
  });

  it("no deja confirmar dos cobros con la misma referencia", async () => {
    const ws = `it-pay-r-${Date.now()}`;
    const a = await payments.create(ws, me, { concept: "Pedido 1", amount: 150000, currency: "COP" });
    const b = await payments.create(ws, me, { concept: "Pedido 2", amount: 150000, currency: "COP" });
    await payments.update(ws, me, a.id, { status: "pagado", reference: "M12345" });
    await expect(payments.update(ws, me, b.id, { status: "pagado", reference: "m12345" })).rejects.toThrow(
      /ya confirmó el cobro «Pedido 1»/,
    );
    // Another workspace may use the same number.
    const other = await payments.create(`${ws}-otro`, me, { concept: "X", amount: 1, currency: "COP" });
    expect((await payments.update(`${ws}-otro`, me, other.id, { status: "pagado", reference: "M12345" })).status).toBe(
      "pagado",
    );
  });

  it("un rechazo necesita motivo y se puede volver a verificar", async () => {
    const ws = `it-pay-x-${Date.now()}`;
    const p = await payments.create(ws, me, { concept: "Curso", amount: 30, currency: "USD" });
    await payments.update(ws, me, p.id, { status: "por_verificar" });
    await expect(payments.update(ws, me, p.id, { status: "rechazado" })).rejects.toThrow(/por qué/);
    const r = await payments.update(ws, me, p.id, { status: "rechazado", rejectReason: "No llegó a la cuenta" });
    expect(r.rejectReason).toBe("No llegó a la cuenta");
    const again = await payments.update(ws, me, p.id, { status: "por_verificar" });
    expect(again.rejectReason).toBeUndefined();
  });

  it("aísla workspaces: contactos, métodos y cobros ajenos", async () => {
    const ws = `it-pay-i-${Date.now()}`;
    const foreign = await prisma.contact.create({ data: { workspaceSlug: `${ws}-otro`, name: "Ajeno" } });
    await expect(payments.create(ws, me, { concept: "X", amount: 1, currency: "USD", contactId: foreign.id })).rejects.toThrow(
      /no es de este workspace/,
    );
    const m = await payments.createMethod(`${ws}-otro`, me, { kind: "otro", label: "Efectivo", currency: "USD", details: {} });
    const p = await payments.create(ws, me, { concept: "X", amount: 1, currency: "USD" });
    await expect(payments.update(ws, me, p.id, { methodId: m.id })).rejects.toThrow(/no es de este workspace/);
    await expect(payments.update(`${ws}-otro`, me, p.id, { note: "hack" })).rejects.toThrow(/no encontrado/);
    expect(await payments.list(`${ws}-otro`)).toEqual([]);
  });
});
