import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AutomationRunnerService, INACTIVE_BATCH, inactiveDays } from "./automation-runner.service";
import { AutomationsService } from "./automations.module";
import { ConsentService } from "../consent/consent.service";

const DAY = 86_400_000;

describe("inactiveDays", () => {
  it("accepts whole days between 1 and 365", () => {
    expect(inactiveDays({ days: "30" })).toBe(30);
    expect(inactiveDays({ days: 7 })).toBe(7);
    expect(inactiveDays({ days: "0" })).toBeNull();
    expect(inactiveDays({ days: "2.5" })).toBeNull();
    expect(inactiveDays({ days: "400" })).toBeNull();
    expect(inactiveDays({})).toBeNull();
  });
});

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Disparador «contacto sin actividad» contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const mk = (optedOut: string[] = []) => {
    const sent: { channel: string; to: string; body: string }[] = [];
    const svc = new AutomationRunnerService(
      { on: () => () => undefined } as never,
      prisma as never,
      {
        sendByChannel: vi.fn(async (_w: string, channel: string, to: string, body: string) => void sent.push({ channel, to, body })),
      } as never,
      {} as never,
      { create: vi.fn() } as never,
      { isHandleOptedOut: vi.fn(async (_w: string, h: string) => optedOut.includes(h)) } as never,
    );
    return { svc, sent };
  };
  const flow = (ws: string, days: string, status = "activo") =>
    prisma.automation.create({
      data: {
        workspaceSlug: ws,
        name: "Reactivar",
        status,
        nodes: [
          { id: "t", type: "trigger", label: "Sin actividad", config: { event: "contact.inactive", days } },
          { id: "m", type: "action", label: "Msg", config: { action: "send-message", body: "Hola {{nombre}}, ¡te extrañamos!" } },
        ],
        edges: [{ id: "e1", from: "t", to: "m" }],
      },
    });
  const contact = (ws: string, name: string, phone: string | null, daysAgo: number | null, extra: object = {}) =>
    prisma.contact.create({
      data: {
        workspaceSlug: ws,
        name,
        phone,
        tags: [],
        lastContactAt: daysAgo == null ? null : new Date(Date.now() - daysAgo * DAY),
        ...extra,
      },
    });

  it("writes once to whoever just reached N quiet days, never to old lists or opted-out contacts", async () => {
    const ws = `it-inactive-${Date.now()}`;
    const f = await flow(ws, "30");
    await contact(ws, "Ana", "+57 300 111 2233", 31); // crossed 30 days yesterday → yes
    await contact(ws, "Beto", "+57 300 444 5566", 10); // still active → no
    await contact(ws, "Carla", "+57 300 777 8899", 90); // quiet for months: not a blast → no
    await contact(ws, "Dani", "+57 300 000 1111", 32, { optOutAt: new Date() }); // opted out → no
    await contact(ws, "Eva", null, 31); // no phone → no
    await contact(ws, "Nunca", "+57 300 222 3333", null); // never wrote → no
    // Ana already has a WhatsApp chat: the message goes there.
    await prisma.conversation.create({
      data: { workspaceSlug: ws, channel: "wa", contactName: "Ana", contactHandle: "573001112233" },
    });

    const r = mk();
    expect(await r.svc.sweepInactive()).toBe(1);
    expect(r.sent).toEqual([{ channel: "wa", to: "573001112233", body: "Hola Ana, ¡te extrañamos!" }]);

    // Same quiet spell: the next sweep (or another process) does nothing.
    const again = mk();
    expect(await again.svc.sweepInactive()).toBe(0);
    expect(again.sent).toHaveLength(0);

    const run = await prisma.automationRun.findFirst({ where: { automationId: f.id } });
    expect(run).toMatchObject({ trigger: "inactive", status: "ok", contactName: "Ana" });
    expect((run!.steps as { note: string }[])[0]!.note).toBe("Sin escribir desde hace 30 días.");
    expect((await prisma.automation.findUnique({ where: { id: f.id } }))!.runs).toBe(1);
    // The history API reports it as an inactivity run.
    const api = new AutomationsService(prisma as never, { record: vi.fn() } as never, {} as never);
    expect((await api.runs(ws, f.id))[0]!.trigger).toBe("inactive");
  });

  it("runs again only after the contact writes and goes quiet again", async () => {
    const ws = `it-inactive-again-${Date.now()}`;
    await flow(ws, "7");
    const c = await contact(ws, "Luz", "+51 900 123 456", 8);
    const r = mk();
    expect(await r.svc.sweepInactive()).toBe(1);

    // Luz writes: her activity moves forward (what ConsentService does on every inbound message).
    const consent = new ConsentService(prisma as never, { on: () => () => undefined } as never, {} as never);
    const later = new Date(Date.now() + 1 * DAY);
    expect(await consent.touchByHandle(ws, "51900123456", later)).toBe(1);
    expect(await r.svc.sweepInactive(new Date(later.getTime() + 2 * DAY))).toBe(0); // only 2 quiet days
    // A week later (a fresh process, so the 30 s anti-spam pause doesn't apply).
    const weekLater = mk();
    expect(await weekLater.svc.sweepInactive(new Date(later.getTime() + 8 * DAY))).toBe(1);
    // No chat yet: falls back to WhatsApp at her phone.
    expect([...r.sent, ...weekLater.sent].map((s) => s.to)).toEqual(["51900123456", "51900123456"]);
    expect((await prisma.contact.findUnique({ where: { id: c.id } }))!.lastContactAt).toEqual(later);
  });

  it("ignores paused flows and invalid day counts, and caps each sweep", async () => {
    const ws = `it-inactive-cap-${Date.now()}`;
    await flow(ws, "30", "pausado");
    await flow(ws, "abc");
    await contact(ws, "Ana", "+57 300 111 2233", 31);
    expect(await mk().svc.sweepInactive()).toBe(0);

    const ws2 = `it-inactive-many-${Date.now()}`;
    await flow(ws2, "3");
    await prisma.contact.createMany({
      data: Array.from({ length: INACTIVE_BATCH + 5 }, (_, i) => ({
        workspaceSlug: ws2,
        name: `C${i}`,
        phone: `+58 412 ${String(1_000_000 + i)}`,
        tags: [],
        lastContactAt: new Date(Date.now() - 4 * DAY),
      })),
    });
    const r = mk();
    expect(await r.svc.sweepInactive()).toBe(INACTIVE_BATCH);
    expect(await r.svc.sweepInactive()).toBe(5);
  });
});
