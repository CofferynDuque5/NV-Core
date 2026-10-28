import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { CampaignRunner, UNCONFIRMED } from "./campaign-runner.service";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("CampaignRunner contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const mk = () => {
    const sent: string[] = [];
    const dispatched: unknown[] = [];
    const providers = {
      sendMessage: vi.fn(async (_w: string, _p: string, m: { to: string }) => {
        sent.push(m.to);
        await new Promise((r) => setTimeout(r, 20));
        return { id: `wamid-${m.to}` };
      }),
      sendMedia: vi.fn(),
      publish: vi.fn(async () => ({ ok: true, id: "p" })),
    };
    const runner = new CampaignRunner(
      {} as never,
      prisma as never,
      providers as never,
      { register: vi.fn(), dispatch: vi.fn(async (_t: string, _w: string, p: unknown) => dispatched.push(p)) } as never,
      { emit: vi.fn() } as never,
      { record: vi.fn() } as never,
      { create: vi.fn() } as never,
    );
    return { runner, sent, dispatched };
  };
  const seed = async (ws: string) => {
    const groups = await Promise.all(
      [1, 2, 3].map((i) => prisma.group.create({ data: { workspaceSlug: ws, name: `G${i}`, remoteJid: `${ws}-${i}@g.us` } })),
    );
    const c = await prisma.campaign.create({
      data: {
        workspaceSlug: ws, name: "IT", status: "programada", message: "Hola", channels: ["wa"],
        scheduleType: "once", scheduleAt: "2026-10-24T10:00:00.000Z",
        targets: { create: groups.map((g) => ({ groupId: g.id })) },
      },
    });
    return { c, groups };
  };

  it("reanuda tras reinicio sin duplicar y sin éxito falso", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it-${Date.now()}`;
    const { c, groups } = await seed(ws);
    const hourAgo = new Date(Date.now() - 3600_000);
    // Estado que deja un proceso muerto a mitad de la campaña.
    await prisma.campaign.update({ where: { id: c.id }, data: { status: "activa", runKey: "once:x", runHeartbeatAt: hourAgo, lastRunAt: hourAgo } });
    await prisma.sendLog.create({ data: { workspaceSlug: ws, campaignId: c.id, groupId: groups[0]!.id, runKey: "once:x", ok: true } });
    await prisma.sendLog.create({ data: { workspaceSlug: ws, campaignId: c.id, groupId: groups[1]!.id, runKey: "once:x", ok: false, error: "en curso…" } });

    const a = mk();
    const b = mk();
    // Dos procesos barren a la vez: solo uno reanuda.
    const [ra, rb] = await Promise.all([a.runner.recoverInterruptedRuns(), b.runner.recoverInterruptedRuns()]);
    expect(ra + rb).toBe(1);
    const payload = [...a.dispatched, ...b.dispatched][0] as { runKey: string; resume: boolean };
    const out = await a.runner.run(ws, c.id, payload);
    expect(a.sent).toEqual([`${ws}-3@g.us`]);
    expect(out).toEqual({ status: "completed", ok: false, sent: 2, failed: 1 });
    const logs = await prisma.sendLog.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.ok, l.error])).toEqual([[true, null], [false, UNCONFIRMED], [true, null]]);
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect([after.status, after.runKey, after.progress]).toEqual(["completada", null, 100]);
    // Reanudar otra vez la misma ejecución no envía nada.
    expect((await a.runner.run(ws, c.id, payload)).status).toBe("skipped");
  });

  it("dos «Enviar ahora» simultáneos: cada chat recibe una sola vez", async () => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    const ws = `it2-${Date.now()}`;
    const { c } = await seed(ws);
    const a = mk();
    const b = mk();
    const outs = await Promise.all([
      a.runner.run(ws, c.id, { runKey: "manual:a" }),
      b.runner.run(ws, c.id, { runKey: "manual:b" }),
    ]);
    expect(outs.map((o) => o.status).sort()).toEqual(["completed", "skipped"]);
    expect([...a.sent, ...b.sent].sort()).toEqual([`${ws}-1@g.us`, `${ws}-2@g.us`, `${ws}-3@g.us`]);
  });

  it("el índice único impide una segunda fila del mismo chat en la misma ejecución", async () => {
    const ws = `it3-${Date.now()}`;
    const { c, groups } = await seed(ws);
    const row = { workspaceSlug: ws, campaignId: c.id, groupId: groups[0]!.id, runKey: "k" };
    await prisma.sendLog.create({ data: row });
    await expect(prisma.sendLog.create({ data: row })).rejects.toMatchObject({ code: "P2002" });
    // Las filas históricas sin runKey siguen permitidas (NULL no choca).
    await prisma.sendLog.create({ data: { ...row, runKey: null } });
    await prisma.sendLog.create({ data: { ...row, runKey: null } });
  });
});
