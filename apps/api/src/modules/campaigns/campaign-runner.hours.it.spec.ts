import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { CampaignRunner } from "./campaign-runner.service";
import { wallClock } from "./date-range";

const url = process.env.IT_DATABASE_URL;
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

describe.skipIf(!url)("CampaignRunner: horario de envío, máximo por día y lotes", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const mk = (onSend?: (to: string) => Promise<void>) => {
    const sent: string[] = [];
    const dispatched: unknown[] = [];
    const notices: { title: string; meta?: string }[] = [];
    const providers = {
      sendMessage: vi.fn(async (_w: string, _p: string, m: { to: string }) => {
        sent.push(m.to);
        await onSend?.(m.to);
        return { id: `wamid-${m.to}` };
      }),
      sendMedia: vi.fn(),
      status: vi.fn(async () => ({ state: "connected" })),
      publish: vi.fn(async () => ({ ok: true, id: "p" })),
    };
    const runner = new CampaignRunner(
      {} as never,
      prisma as never,
      providers as never,
      { register: vi.fn(), dispatch: vi.fn(async (_t: string, _w: string, p: unknown) => dispatched.push(p)) } as never,
      { emit: vi.fn() } as never,
      { record: vi.fn() } as never,
      { create: vi.fn(async (_w: string, n: { title: string; meta?: string }) => void notices.push(n)) } as never,
    );
    return { runner, sent, dispatched, notices };
  };
  const seed = async (ws: string, extra: Record<string, unknown> = {}) => {
    const groups = await Promise.all(
      [1, 2, 3].map((i) =>
        prisma.group.create({ data: { workspaceSlug: ws, name: `G${i}`, remoteJid: `${ws}-${i}@g.us` } }),
      ),
    );
    const c = await prisma.campaign.create({
      data: {
        workspaceSlug: ws,
        name: "IT horario",
        status: "programada",
        message: "Hola",
        channels: ["wa"],
        scheduleType: "once",
        scheduleAt: "2026-10-24T10:00:00.000Z",
        targets: { create: groups.map((g) => ({ groupId: g.id })) },
        ...extra,
      },
    });
    return { c, groups };
  };

  it("fuera del horario, los grupos esperan y luego reciben solo ellos", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-hours-${Date.now()}`;
    const { c, groups } = await seed(ws);
    const a = mk();
    const tz = (await a.runner.timeZones([ws])).get(ws)!;
    const now = wallClock(new Date(), tz).minutes;
    // Brand window opens in 60 min; G2 has its own window, open now.
    await prisma.workspaceSettings.create({
      data: { workspaceSlug: ws, sendFrom: hhmm(now + 60), sendUntil: hhmm(now + 120) },
    });
    await prisma.group.update({
      where: { id: groups[1]!.id },
      data: { sendFrom: hhmm(now - 60), sendUntil: hhmm(now + 60) },
    });

    const out = await a.runner.run(ws, c.id, { runKey: "manual:h1" });
    expect(out).toMatchObject({ status: "completed", sent: 1 });
    expect(a.sent).toEqual([`${ws}-2@g.us`]);
    let after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.pendingGroups.sort()).toEqual([groups[0]!.id, groups[2]!.id].sort());
    const waitMin = (after.pendingAt!.getTime() - Date.now()) / 60_000;
    expect(waitMin).toBeGreaterThan(58);
    expect(waitMin).toBeLessThan(61);
    expect(a.notices.some((n) => n.title.includes("2 grupos esperan su horario"))).toBe(true);

    // Not yet due: nothing is dispatched.
    expect(await a.runner.dispatchPending()).toBe(0);
    // Their hour comes (the window is open now).
    await prisma.workspaceSettings.update({ where: { workspaceSlug: ws }, data: { sendFrom: null, sendUntil: null } });
    await prisma.campaign.update({
      where: { id: c.id },
      data: { pendingAt: new Date(Date.now() - 1000), lastRunAt: new Date(Date.now() - 5 * 60_000) },
    });
    const b = mk();
    const [na, nb] = await Promise.all([a.runner.dispatchPending(), b.runner.dispatchPending()]);
    expect(na + nb).toBe(1);
    const payload = [...a.dispatched, ...b.dispatched][0] as { runKey: string; onlyGroups: string[] };
    expect(payload.runKey.startsWith("pending:")).toBe(true);
    await a.runner.run(ws, c.id, payload);
    expect(a.sent.sort()).toEqual([`${ws}-1@g.us`, `${ws}-2@g.us`, `${ws}-3@g.us`]);
    after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect([after.pendingGroups, after.pendingAt]).toEqual([[], null]);
  });

  it("un grupo que ya llegó a su máximo del día se salta con el motivo", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-max-${Date.now()}`;
    const { c, groups } = await seed(ws);
    await prisma.workspaceSettings.create({ data: { workspaceSlug: ws, groupMaxPerDay: 1 } });
    // G1 already got a campaign message today; G2 has its own, higher limit.
    // An older send without runKey counts too.
    await prisma.sendLog.create({ data: { workspaceSlug: ws, campaignId: c.id, groupId: groups[0]!.id, runKey: null, ok: true } });
    await prisma.sendLog.create({ data: { workspaceSlug: ws, campaignId: c.id, groupId: groups[1]!.id, runKey: "old", ok: true } });
    await prisma.group.update({ where: { id: groups[1]!.id }, data: { maxPerDay: 2 } });
    const a = mk();
    await a.runner.run(ws, c.id, { runKey: "slot:max" });
    expect(a.sent.sort()).toEqual([`${ws}-2@g.us`, `${ws}-3@g.us`]);
    const notice = a.notices.find((n) => n.meta?.includes("1 grupo porque ya recibieron hoy su máximo"));
    expect(notice).toBeTruthy();
  });

  it("envío por lotes: pausa entre lotes y «Pausar» la corta", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    process.env.CAMPAIGN_BATCH_MINUTE_MS = "150";
    try {
      const ws = `it-batch-${Date.now()}`;
      const { c } = await seed(ws, { batchSize: 1, batchPauseMin: 1 });
      const a = mk();
      const t0 = Date.now();
      await a.runner.run(ws, c.id, { runKey: "manual:b1" });
      expect(a.sent).toHaveLength(3);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(290); // two pauses of ~150 ms

      const ws2 = `it-batch2-${Date.now()}`;
      const { c: c2 } = await seed(ws2, { batchSize: 1, batchPauseMin: 1 });
      const b = mk(async () => {
        await prisma.campaign.update({ where: { id: c2.id }, data: { status: "pausada" } });
      });
      const out = await b.runner.run(ws2, c2.id, { runKey: "manual:b2" });
      expect(out.status).toBe("paused");
      expect(b.sent).toHaveLength(1);
    } finally {
      delete process.env.CAMPAIGN_BATCH_MINUTE_MS;
    }
  });

  it("una campaña diaria que nunca se envió sale a su hora (antes nunca salía)", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-daily-${Date.now()}`;
    const a = mk();
    const tz = (await a.runner.timeZones([ws])).get(ws)!;
    const now = wallClock(new Date(), tz).minutes;
    const { c } = await seed(ws, { scheduleType: "daily", scheduleAt: null, scheduleTimes: [hhmm(now - 1)] });
    expect(c.lastRunSlot).toBeNull();
    const mine = () => a.dispatched.filter((p) => (p as { campaignId: string }).campaignId === c.id);
    await (a.runner as unknown as { tick(): Promise<void> }).tick();
    expect(mine()).toHaveLength(1);
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.lastRunSlot).toMatch(/T\d{2}:\d{2}$/);
    // The same slot never fires twice.
    await (a.runner as unknown as { tick(): Promise<void> }).tick();
    expect(mine()).toHaveLength(1);
  });

  it("un canal que no responde no frena la campaña: falla con motivo y sigue con los demás", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    process.env.CAMPAIGN_SEND_TIMEOUT_MS = "1000";
    try {
      const ws = `it-hang-${Date.now()}`;
      const { c, groups: g1 } = await seed(ws);
      await prisma.group.update({ where: { id: g1[0]!.id }, data: { channel: "tg" } });
      // The first group (Telegram) never answers (a half-dead Telegram/WhatsApp session).
      const a = mk((to) => (to.endsWith("-1@g.us") ? new Promise<void>(() => undefined) : Promise.resolve()));
      const out = await a.runner.run(ws, c.id, { runKey: "manual:hang" });
      expect(out).toMatchObject({ status: "completed", sent: 2, failed: 1 });
      const failed = await prisma.sendLog.findFirstOrThrow({ where: { campaignId: c.id, ok: false } });
      expect(failed.error).toMatch(/no respondió en 1 s/);

      // A whole Telegram account that stops answering: its other groups fail at
      // once (no 1-timeout-per-group), WhatsApp groups still go out.
      const ws2 = `it-hang2-${Date.now()}`;
      const { c: c2, groups } = await seed(ws2);
      await prisma.group.updateMany({ where: { id: { in: [groups[0]!.id, groups[1]!.id] } }, data: { channel: "tg" } });
      const b = mk((to) => (to.endsWith("-1@g.us") || to.endsWith("-2@g.us") ? new Promise<void>(() => undefined) : Promise.resolve()));
      const t0 = Date.now();
      const out2 = await b.runner.run(ws2, c2.id, { runKey: "manual:hang2" });
      expect(Date.now() - t0).toBeLessThan(1900);
      expect(out2).toMatchObject({ sent: 1, failed: 2 });
      const errs = (await prisma.sendLog.findMany({ where: { campaignId: c2.id, ok: false } })).map((l) => l.error);
      expect(errs.some((e) => /se saltó este grupo/.test(e ?? ""))).toBe(true);
    } finally {
      delete process.env.CAMPAIGN_SEND_TIMEOUT_MS;
    }
  });
});
