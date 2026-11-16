import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { NotificationsService } from "../notifications/notifications.module";
import { CampaignRunner } from "./campaign-runner.service";
import { wallClock } from "./date-range";

const url = process.env.IT_DATABASE_URL;
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
type Tickable = { tick(): Promise<void> };

describe.skipIf(!url)("CampaignRunner: aviso antes de enviar, éxitos y anti-ban entre campañas", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const notifications = new NotificationsService(prisma as never);
  const mk = () => {
    const sent: { to: string; at: number }[] = [];
    const dispatched: { campaignId: string; runKey: string }[] = [];
    const providers = {
      sendMessage: vi.fn(async (_w: string, _p: string, m: { to: string }) => {
        sent.push({ to: m.to, at: Date.now() });
        return { id: `id-${m.to}` };
      }),
      sendMedia: vi.fn(),
      status: vi.fn(async () => ({ state: "connected" })),
      publish: vi.fn(async () => ({ ok: true, id: "p" })),
    };
    const runner = new CampaignRunner(
      {} as never,
      prisma as never,
      providers as never,
      {
        register: vi.fn(),
        dispatch: vi.fn(async (_t: string, _w: string, p: unknown) => void dispatched.push(p as never)),
      } as never,
      { emit: vi.fn() } as never,
      { record: vi.fn() } as never,
      notifications,
    );
    return { runner, sent, dispatched };
  };
  const seed = async (ws: string, extra: Record<string, unknown>, tag = "") => {
    const groups = await Promise.all(
      ["Ventas Caracas", "Ofertas Maracay", "Clientes VIP"].map((name, i) =>
        prisma.group.create({ data: { workspaceSlug: ws, name, remoteJid: `${ws}${tag}-${i + 1}@g.us` } }),
      ),
    );
    const c = await prisma.campaign.create({
      data: {
        workspaceSlug: ws,
        name: "Promo",
        status: "programada",
        message: "Hola",
        channels: ["wa"],
        targets: { create: groups.map((g) => ({ groupId: g.id })) },
        ...extra,
      },
    });
    return { c, groups };
  };
  const notices = (ws: string) =>
    prisma.notification.findMany({ where: { workspaceSlug: ws }, orderBy: { createdAt: "asc" } });

  it("avisa 15 min antes con «Confirmar» / «No enviar»; «No enviar» salta solo ese envío", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-confirm-${Date.now()}`;
    const a = mk();
    const tz = (await a.runner.timeZones([ws])).get(ws)!;
    const now = wallClock(new Date(), tz).minutes;
    const { c } = await seed(ws, { scheduleType: "daily", scheduleTimes: [hhmm(now + 10)] });
    const tick = () => (a.runner as unknown as Tickable).tick();

    await tick();
    await tick(); // never twice for the same send
    const list = await notices(ws);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toMatch(/^Campaña «Promo» sale a las \d{2}:\d{2}$/);
    expect(list[0]!.meta).toContain("Va a 3 grupos (3 de WhatsApp).");
    expect(list[0]!.meta).toContain("Envío anti-ban:");
    expect(list[0]!.meta).toContain("Si no respondes, sale a su hora.");
    const action = list[0]!.actions as { slot: string; state: string; campaignId: string };
    expect(action).toMatchObject({ type: "campaign-confirm", campaignId: c.id, state: "pending" });

    await a.runner.decideSend(ws, c.id, action.slot, "skip", "ana@nv.tv");
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect([after.confirmState, after.lastRunSlot, after.status]).toEqual(["skipped", action.slot, "programada"]);
    expect((await notices(ws))[0]!.actions).toMatchObject({ state: "skipped", by: "ana@nv.tv" });
    await expect(a.runner.decideSend(ws, c.id, "otro", "confirm", "ana@nv.tv")).rejects.toThrow(/ya pasó/);

    // When its time comes, nothing goes out.
    await prisma.campaign.update({ where: { id: c.id }, data: { scheduleTimes: [hhmm(now - 1)] } });
    await prisma.campaign.update({ where: { id: c.id }, data: { lastRunSlot: action.slot.replace(/T.*/, `T${hhmm(now - 1)}`), confirmSlot: action.slot.replace(/T.*/, `T${hhmm(now - 1)}`) } });
    await tick();
    expect(a.dispatched.filter((d) => d.campaignId === c.id)).toHaveLength(0);
  });

  it("«Solo con confirmación»: no sale hasta pulsar «Confirmar envío»", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-require-${Date.now()}`;
    await prisma.workspaceSettings.create({ data: { workspaceSlug: ws, sendConfirm: "require" } });
    const a = mk();
    const { c } = await seed(ws, {
      scheduleType: "once",
      scheduleAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const tick = () => (a.runner as unknown as Tickable).tick();
    const mine = () => a.dispatched.filter((d) => d.campaignId === c.id);

    await tick();
    expect(mine()).toHaveLength(0);
    const [n] = await notices(ws);
    expect(n!.meta).toContain("Solo sale si pulsas «Confirmar envío».");
    await a.runner.decideSend(ws, c.id, (n!.actions as { slot: string }).slot, "confirm", "ana@nv.tv");
    await tick();
    expect(mine()).toHaveLength(1);
  });

  it("al terminar, el aviso nombra cada grupo donde salió", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-success-${Date.now()}`;
    await prisma.workspaceSettings.create({ data: { workspaceSlug: ws, sendConfirm: "off" } });
    const a = mk();
    const { c } = await seed(ws, { scheduleType: "once", scheduleAt: "2026-10-24T10:00:00.000Z" });
    await a.runner.run(ws, c.id, { runKey: "manual:ok" });
    const done = (await notices(ws)).find((n) => n.type === "success")!;
    expect(done.title).toBe("Campaña «Promo» enviada: 3 de 3 con éxito");
    expect(done.meta).toContain("Todos salieron bien. Salió en: ");
    // Order follows when each send finished; every group must be named.
    for (const name of ["Ventas Caracas", "Ofertas Maracay", "Clientes VIP"]) expect(done.meta).toContain(name);
  });

  it("anti-ban: dos campañas a la vez por el mismo número respetan la pausa entre mensajes", async () => {
    process.env.WHATSAPP_SEND_MIN_MS = "150";
    process.env.WHATSAPP_SEND_MAX_MS = "150";
    process.env.WHATSAPP_COOLDOWN_MS = "0";
    try {
      const ws = `it-pace-${Date.now()}`;
      const a = mk();
      const { c: c1 } = await seed(ws, { scheduleType: "once" });
      const { c: c2 } = await seed(ws, { scheduleType: "once", name: "Promo 2" }, "b");
      await Promise.all([a.runner.run(ws, c1.id, { runKey: "manual:p1" }), a.runner.run(ws, c2.id, { runKey: "manual:p2" })]);
      expect(a.sent).toHaveLength(6);
      const times = a.sent.map((s) => s.at).sort((x, y) => x - y);
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(140);
    } finally {
      delete process.env.WHATSAPP_SEND_MIN_MS;
      delete process.env.WHATSAPP_SEND_MAX_MS;
      delete process.env.WHATSAPP_COOLDOWN_MS;
    }
  });
});
