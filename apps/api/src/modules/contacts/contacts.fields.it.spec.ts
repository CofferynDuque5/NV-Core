import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AutomationRunnerService, birthdayHour } from "../automations/automation-runner.service";
import { localDayKey } from "../reports/weekly-report";
import { SegmentsService } from "../segments/segments.module";
import { ContactsService } from "./contacts.module";

describe("birthdayHour", () => {
  it("defaults to 9 and accepts 0–23", () => {
    expect(birthdayHour({})).toBe(9);
    expect(birthdayHour({ hour: "7" })).toBe(7);
    expect(birthdayHour({ hour: "0" })).toBe(0);
    expect(birthdayHour({ hour: "25" })).toBe(9);
  });
});

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Campos personalizados, cumpleaños y segmentos contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const audit = { record: vi.fn() };
  const contacts = new ContactsService(prisma as never, audit as never, { assertWithinLimit: vi.fn() } as never, {} as never);
  const segments = new SegmentsService(prisma as never, audit as never);
  const tz = "America/Caracas";
  const today = localDayKey(new Date(), tz);
  const md = today.slice(5);

  async function brand(name: string) {
    const ws = `it-fields-${name}-${Date.now()}`;
    await prisma.workspaceSettings.create({ data: { workspaceSlug: ws, timeZone: tz } });
    return ws;
  }

  it("guarda campos, valida valores y conserva los que no se envían", async () => {
    const ws = await brand("vals");
    const defs = await contacts.saveFields(ws, "a@x", [
      { label: "Ciudad", type: "text" },
      { label: "Plan", type: "select", options: ["Mensual", "Anual"] },
      { label: "Pantallas", type: "number" },
    ]);
    expect(defs.map((d) => d.key)).toEqual(["ciudad", "plan", "pantallas"]);
    expect(await contacts.fields(ws)).toEqual(defs);

    const c = await contacts.create(ws, "a@x", {
      name: "Ana",
      birthday: "15/03/1990",
      custom: { ciudad: "Caracas", plan: "Anual", desconocido: "x" },
    });
    expect(c.birthday).toBe("1990-03-15");
    expect(c.custom).toEqual({ ciudad: "Caracas", plan: "Anual" });

    const u = await contacts.update(ws, "a@x", c.id, { custom: { pantallas: "2", ciudad: "" } });
    expect(u.custom).toEqual({ plan: "Anual", pantallas: "2" });
    await expect(contacts.update(ws, "a@x", c.id, { custom: { plan: "Diario" } })).rejects.toThrow(/no es una opción/);
    await expect(contacts.update(ws, "a@x", c.id, { birthday: "31/02" })).rejects.toThrow(/Cumpleaños no válido/);
    expect((await contacts.update(ws, "a@x", c.id, { birthday: "" })).birthday).toBeUndefined();

    const csv = await contacts.exportCsv(ws);
    expect(csv.split("\n")[0]).toContain("Ciudad");
    expect(csv).toContain("Anual");
  });

  it("segmentos por cumpleaños y por campo; exportar y etiquetar a todos", async () => {
    const ws = await brand("seg");
    await contacts.saveFields(ws, "a@x", [{ label: "Ciudad", type: "text" }]);
    const hoy = await contacts.create(ws, "a@x", { name: "Hoy", birthday: md, custom: { ciudad: "Maracay" }, tags: ["vip"] });
    await contacts.create(ws, "a@x", { name: "Otro", birthday: "01-01" === md ? "02-02" : "01-01", custom: { ciudad: "Lima" } });
    await contacts.create(ws, "a@x", { name: "Sin fecha" });

    const cumple = await segments.create(ws, "a@x", {
      name: "Cumplen hoy",
      rules: [{ field: "birthday", operator: "birthday_in_days", value: "0" }],
    });
    expect(cumple.count).toBe(1);
    const ciudad = await segments.preview(ws, { rules: [{ field: "custom.ciudad", operator: "contains", value: "Mara" }] });
    expect(ciudad.sample.map((c) => c.name)).toEqual(["Hoy"]);
    await expect(
      segments.preview(ws, { rules: [{ field: "custom.ciudad", operator: "has_tag", value: "x" }] }),
    ).rejects.toThrow(/campo personalizado/);

    const list = await contacts.list(ws, { page: 1, pageSize: 50, segment: cumple.id } as never);
    expect(list.items.map((c) => c.name)).toEqual(["Hoy"]);

    const csv = await segments.exportCsv(ws, cumple.id);
    expect(csv.trim().split("\n")).toHaveLength(2);
    expect(csv).toContain("Maracay");

    expect(await segments.tagAll(ws, "a@x", cumple.id, { add: ["cumple", "vip"], remove: ["frio"] })).toEqual({ updated: 1 });
    expect((await prisma.contact.findUnique({ where: { id: hoy.id } }))!.tags).toEqual(["cumple", "vip"]);
    await expect(segments.tagAll(ws, "a@x", cumple.id, {})).rejects.toThrow(/etiquetas/);
    await expect(segments.exportCsv(`otra-${ws}`, cumple.id)).rejects.toThrow(/no encontrado/);
  });

  it("felicita una vez a quien cumple hoy, desde la hora elegida", async () => {
    const ws = await brand("bday");
    const flow = await prisma.automation.create({
      data: {
        workspaceSlug: ws,
        name: "Cumpleaños",
        status: "activo",
        nodes: [
          { id: "t", type: "trigger", label: "Cumple", config: { event: "contact.birthday", hour: "0" } },
          { id: "m", type: "action", label: "Msg", config: { action: "send-message", body: "¡Feliz cumpleaños, {{nombre}}!" } },
        ],
        edges: [{ id: "e1", from: "t", to: "m" }],
      },
    });
    await prisma.contact.createMany({
      data: [
        { workspaceSlug: ws, name: "Ana", phone: "+58 412 111 2233", birthday: `1990-${md}`, tags: [] },
        { workspaceSlug: ws, name: "Baja", phone: "+58 412 999 0000", birthday: md, tags: [], optOutAt: new Date() },
        { workspaceSlug: ws, name: "Mañana", phone: "+58 412 555 0000", birthday: md === "12-31" ? "01-02" : "12-31", tags: [] },
      ],
    });
    const mk = () => {
      const sent: string[] = [];
      const svc = new AutomationRunnerService(
        { on: () => () => undefined } as never,
        prisma as never,
        { sendByChannel: vi.fn(async (_w: string, _c: string, to: string, body: string) => void sent.push(`${to}|${body}`)) } as never,
        {} as never,
        { create: vi.fn() } as never,
        { isHandleOptedOut: vi.fn(async () => false) } as never,
      );
      return { svc, sent };
    };
    const r = mk();
    expect(await r.svc.sweepBirthdays()).toBe(1);
    expect(r.sent).toEqual(["584121112233|¡Feliz cumpleaños, Ana!"]);
    expect(await mk().svc.sweepBirthdays()).toBe(0);
    const run = await prisma.automationRun.findFirst({ where: { automationId: flow.id } });
    expect(run?.trigger).toBe("birthday");

    // Before the chosen hour nothing happens.
    const ws2 = await brand("early");
    await prisma.automation.create({
      data: { workspaceSlug: ws2, name: "C", status: "activo", nodes: flow.nodes as never, edges: flow.edges as never },
    });
    await prisma.automation.update({
      where: { id: (await prisma.automation.findFirst({ where: { workspaceSlug: ws2 } }))!.id },
      data: {
        nodes: [
          { id: "t", type: "trigger", label: "Cumple", config: { event: "contact.birthday", hour: "23" } },
          { id: "m", type: "action", label: "Msg", config: { action: "send-message", body: "x" } },
        ],
      },
    });
    await prisma.contact.create({ data: { workspaceSlug: ws2, name: "Luz", phone: "+58 414 000 1111", birthday: md, tags: [] } });
    const early = new Date(`${today}T12:00:00-04:00`); // 12:00 in Caracas
    expect(await mk().svc.sweepBirthdays(early)).toBe(0);
  });
});
