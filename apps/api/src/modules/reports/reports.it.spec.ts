import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { NotificationsService } from "../notifications/notifications.module";
import { ReportsService } from "./reports.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Informe semanal contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const notifications = new NotificationsService(prisma as never);
  const audit = { record: async () => undefined };
  const reports = new ReportsService(prisma as never, notifications, audit as never);
  const at = (s: string) => new Date(`2026-10-${s}Z`);

  async function seed(ws: string) {
    const user = await prisma.user.create({ data: { email: `${ws}@nv.tv`, name: "Ana", passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: user.id, workspaceSlug: ws, role: "Owner", createdAt: at("01T00:00:00") } });
    // Contacts: 3 in the week (2 from Instagram), 1 the week before, 1 in another workspace.
    const ig = { source: "instagram", via: "form" };
    await prisma.contact.createMany({
      data: [
        { workspaceSlug: ws, name: "A", createdAt: at("12T09:00:00"), attribution: ig },
        { workspaceSlug: ws, name: "B", createdAt: at("14T09:00:00"), attribution: ig },
        { workspaceSlug: ws, name: "C", createdAt: at("18T23:00:00") },
        { workspaceSlug: ws, name: "D", createdAt: at("08T09:00:00") },
        { workspaceSlug: `${ws}-otro`, name: "E", createdAt: at("13T09:00:00") },
      ],
    });
    // Inbox: one waiting for a reply, one answered, one asking for a person.
    const waiting = await prisma.conversation.create({
      data: { workspaceSlug: ws, channel: "wa", contactName: "Lucía", createdAt: at("13T10:00:00") },
    });
    const answered = await prisma.conversation.create({
      data: { workspaceSlug: ws, channel: "wa", contactName: "Pedro", createdAt: at("13T11:00:00") },
    });
    const human = await prisma.conversation.create({
      data: { workspaceSlug: ws, channel: "tg", contactName: "Marta", labels: ["requiere-humano"], createdAt: at("15T10:00:00") },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: waiting.id, direction: "in", text: "¿precio?", createdAt: at("13T10:00:00") },
        { conversationId: answered.id, direction: "in", text: "hola", createdAt: at("13T11:00:00") },
        { conversationId: answered.id, direction: "out", text: "¡hola!", createdAt: at("13T11:05:00") },
        { conversationId: human.id, direction: "in", text: "quiero hablar con alguien", createdAt: at("15T10:00:00") },
      ],
    });
    await prisma.post.createMany({
      data: [
        { workspaceSlug: ws, channel: "ig", title: "Reel lanzamiento", status: "sent", scheduledAt: at("14T15:00:00") },
        { workspaceSlug: ws, channel: "fb", title: "Post fallido", status: "error", scheduledAt: at("15T15:00:00") },
      ],
    });
    await prisma.sendLog.createMany({
      data: [
        { workspaceSlug: ws, campaignName: "Promo", groupName: "Clientes", ok: true, createdAt: at("16T10:00:00") },
        { workspaceSlug: ws, campaignName: "Promo", groupName: "Clientes", ok: true, createdAt: at("16T10:01:00") },
        { workspaceSlug: ws, campaignName: "Promo", groupName: "VIP", ok: false, error: "Sesión cerrada", createdAt: at("16T10:02:00") },
      ],
    });
    const flow = await prisma.automation.create({ data: { workspaceSlug: ws, name: "Bienvenida" } });
    await prisma.automationRun.createMany({
      data: [
        { workspaceSlug: ws, automationId: flow.id, trigger: "message", contactHandle: "1", status: "ok", startedAt: at("13T10:00:01") },
        { workspaceSlug: ws, automationId: flow.id, trigger: "message", contactHandle: "2", status: "error", error: "IA sin configurar", startedAt: at("15T10:00:01") },
      ],
    });
    await prisma.task.createMany({
      data: [
        { workspaceSlug: ws, title: "Editar video", status: "done", completedAt: at("16T12:00:00"), createdBy: "x" },
        { workspaceSlug: ws, title: "Llamar a proveedor", status: "todo", dueAt: at("10T12:00:00"), createdBy: "x" },
      ],
    });
    // Payments: confirmed in the week (2 COP + 1 USDT), the week before (COP + PEN), waiting, overdue, another workspace.
    const pay = (concept: string, amount: number, currency: string, extra: object) => ({
      workspaceSlug: ws,
      concept,
      amount,
      currency,
      createdBy: "x",
      ...extra,
    });
    await prisma.paymentRequest.createMany({
      data: [
        pay("Plan Pro", 150000, "COP", { status: "pagado", paidAt: at("13T12:00:00") }),
        pay("Asesoría", 50000, "COP", { status: "pagado", paidAt: at("15T12:00:00") }),
        pay("Curso", 25, "USDT", { status: "pagado", paidAt: at("16T12:00:00") }),
        pay("Plan Pro", 100000, "COP", { status: "pagado", paidAt: at("07T12:00:00") }),
        pay("Plan mensual", 49.9, "PEN", { status: "pagado", paidAt: at("08T12:00:00") }),
        pay("Pedido 12", 80000, "COP", { status: "por_verificar", methodLabel: "Nequi", reference: "M123" }),
        pay("Pedido 9", 20, "USD", { status: "pendiente", dueAt: at("10T12:00:00") }),
        { ...pay("Ajeno", 999, "COP", { status: "pagado", paidAt: at("13T12:00:00") }), workspaceSlug: `${ws}-otro` },
      ],
    });
  }

  it("genera la semana cerrada una sola vez, con cifras reales y lo pendiente", async () => {
    const ws = `it-rep-${Date.now()}`;
    await seed(ws);
    const wednesday = at("21T10:00:00");

    expect(await reports.sweep(wednesday)).toBeGreaterThanOrEqual(1);
    const report = await reports.get(ws, "2026-10-12");
    expect(report.weekEnd).toBe("2026-10-18");
    const m = Object.fromEntries(report.metrics.map((x) => [x.key, [x.value, x.previous]]));
    expect(m).toMatchObject({
      contacts: [3, 1],
      conversations: [3, 0],
      messagesIn: [3, 0],
      messagesOut: [1, 0],
      postsSent: [1, 0],
      campaignSends: [2, 0],
      automationRuns: [1, 0],
      tasksDone: [1, 0],
    });
    expect(report.leadSources).toEqual([
      { source: "instagram", count: 2 },
      { source: null, count: 1 },
    ]);
    const a = Object.fromEntries(report.attention.map((x) => [x.key, x]));
    expect(a.overdueTasks?.items[0]).toMatchObject({ label: "Llamar a proveedor", meta: "vencía 10/10" });
    expect(a.unanswered?.items.map((i) => i.label)).toEqual(["Lucía", "Marta"]);
    expect(a.needsHuman?.count).toBe(1);
    expect(a.postErrors?.items[0]?.label).toBe("Post fallido");
    expect(a.sendErrors?.items[0]).toMatchObject({ label: "Promo → VIP", meta: "Sesión cerrada" });
    expect(a.automationErrors?.items[0]).toMatchObject({ label: "Bienvenida", meta: "IA sin configurar" });
    expect(a.paymentsToVerify).toMatchObject({ count: 1, section: "cobros" });
    expect(a.paymentsToVerify?.items[0]).toMatchObject({ label: "Pedido 12", meta: "$ 80.000 COP · Nequi · ref M123" });
    expect(a.overduePayments?.items[0]).toMatchObject({ label: "Pedido 9", meta: "US$ 20,00 · vencía 10/10" });
    // Money per currency, never added across currencies.
    expect(report.payments).toEqual([
      { currency: "COP", amount: 200000, count: 2, previousAmount: 100000, previousCount: 1 },
      { currency: "PEN", amount: 0, count: 0, previousAmount: 49.9, previousCount: 1 },
      { currency: "USDT", amount: 25, count: 1, previousAmount: 0, previousCount: 0 },
    ]);

    // A second sweep (or another instance) neither duplicates nor notifies again.
    await reports.sweep(wednesday);
    await reports.generate(ws, new Date("2026-10-12T00:00:00Z"));
    expect(await prisma.weeklyReport.count({ where: { workspaceSlug: ws } })).toBe(1);
    const notes = await prisma.notification.findMany({ where: { workspaceSlug: ws } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Tu resumen semanal está listo", type: "warning" });
    expect(notes[0]?.meta).toContain("3 contactos nuevos (+2)");
    expect(notes[0]?.meta).toContain("3 cobros confirmados");

    expect(await reports.list(ws)).toEqual([expect.objectContaining({ weekStart: "2026-10-12", weekEnd: "2026-10-18" })]);
  });

  it("no mezcla workspaces ni inventa semanas", async () => {
    const ws = `it-rep-i-${Date.now()}`;
    await seed(ws);
    await reports.generate(ws, new Date("2026-10-12T00:00:00Z"));
    expect(await reports.list(`${ws}-otro`)).toEqual([]);
    await expect(reports.get(`${ws}-otro`, "2026-10-12")).rejects.toThrow(/No hay informe/);
    await expect(reports.get(ws, "2026-10-13")).rejects.toThrow(/lunes/);
  });

  it("omite workspaces que aún no se usaban esa semana", async () => {
    const ws = `it-rep-n-${Date.now()}`;
    const user = await prisma.user.create({ data: { email: `${ws}@nv.tv`, name: "N", passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: user.id, workspaceSlug: ws, role: "Owner", createdAt: at("20T00:00:00") } });
    await reports.sweep(at("21T10:00:00"));
    expect(await reports.list(ws)).toEqual([]);
  });

  it("la semana en curso se calcula al momento y no se guarda", async () => {
    const ws = `it-rep-c-${Date.now()}`;
    // A second ago: Postgres rounds createdAt to the millisecond, which can land
    // just after the "now" the live week is cut at if both happen in the same ms.
    await prisma.contact.create({ data: { workspaceSlug: ws, name: "Hoy", createdAt: new Date(Date.now() - 1000) } });
    const live = await reports.current(ws);
    expect(live.id).toBe("actual");
    expect(live.metrics.find((x) => x.key === "contacts")?.value).toBe(1);
    expect(await prisma.weeklyReport.count({ where: { workspaceSlug: ws } })).toBe(0);
  });

  it("corta la semana a la medianoche de la marca (Caracas)", async () => {
    const ws = `it-rep-tz-${Date.now()}`;
    const user = await prisma.user.create({ data: { email: `${ws}@nv.tv`, name: "Tz", passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: user.id, workspaceSlug: ws, role: "Owner", createdAt: at("12T10:00:00") } });
    expect(await reports.settings(ws)).toEqual({ timeZone: "UTC" });
    expect(await reports.updateSettings(ws, "ana@nv.tv", { timeZone: "America/Caracas" })).toEqual({
      timeZone: "America/Caracas",
    });
    await prisma.contact.createMany({
      data: [
        // Sunday 18, 23:00 in Caracas (already Monday in UTC): belongs to the week of the 12th.
        { workspaceSlug: ws, name: "Domingo noche", createdAt: at("19T03:00:00") },
        // Monday 19, 01:00 in Caracas: next week.
        { workspaceSlug: ws, name: "Lunes", createdAt: at("19T05:00:00") },
      ],
    });
    await prisma.task.create({
      data: { workspaceSlug: ws, title: "Pagar hosting", status: "todo", dueAt: at("16T02:00:00"), createdBy: "x" },
    });

    // Monday 00:30 UTC is still Sunday evening in Caracas: the week is not closed there yet.
    await reports.sweep(at("19T00:30:00"));
    expect(await reports.list(ws)).toEqual([]);
    // Monday 01:00 in Caracas: now it is.
    await reports.sweep(at("19T05:00:00"));
    const report = await reports.get(ws, "2026-10-12");
    expect(report.timeZone).toBe("America/Caracas");
    expect(report.metrics.find((m) => m.key === "contacts")?.value).toBe(1);
    // Dates shown in the brand's own day (15/10 in Caracas, 16/10 in UTC).
    expect(report.attention.find((a) => a.key === "overdueTasks")?.items[0]?.meta).toBe("vencía 15/10");

    // An unknown saved zone falls back to UTC instead of breaking the report.
    await prisma.workspaceSettings.update({ where: { workspaceSlug: ws }, data: { timeZone: "Marte/Base" } });
    expect(await reports.settings(ws)).toEqual({ timeZone: "UTC" });
  });
});
