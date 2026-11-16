import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { DEAD_GROUP_DAYS, isDeadGroup, recordGroupActivity, resetGroupActivityThrottle } from "./group-activity";
import { GroupsService } from "./groups.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Grupos: actividad y último envío contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const groups = new GroupsService(prisma as never, {} as never, {} as never);

  it("guarda la hora del último mensaje (con freno) y marca los grupos sin actividad", async () => {
    resetGroupActivityThrottle();
    const ws = `it-gact-${Date.now()}`;
    const old = new Date(Date.now() - (DEAD_GROUP_DAYS + 5) * 86_400_000);
    const alive = await prisma.group.create({
      data: { workspaceSlug: ws, name: "Ventas VE", channel: "wa", remoteJid: "111@g.us", watchedSince: old },
    });
    const dead = await prisma.group.create({
      data: { workspaceSlug: ws, name: "Grupo dormido", channel: "wa", remoteJid: "222@g.us", watchedSince: old },
    });
    await prisma.group.create({ data: { workspaceSlug: ws, name: "Nuevo", channel: "tg", remoteJid: "-100333" } });

    const t1 = new Date(Date.now() - 60_000);
    expect(await recordGroupActivity(prisma as never, ws, "wa", "111@g.us", t1)).toBe(true);
    // Throttled: a second message minutes later is not written.
    expect(await recordGroupActivity(prisma as never, ws, "wa", "111@g.us", new Date())).toBe(false);
    // Other brands never get it.
    expect(await recordGroupActivity(prisma as never, `${ws}-x`, "wa", "222@g.us", new Date())).toBe(true);

    await prisma.sendLog.create({
      data: { workspaceSlug: ws, groupId: dead.id, groupName: dead.name, ok: true, createdAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    await prisma.sendLog.create({ data: { workspaceSlug: ws, groupId: dead.id, groupName: dead.name, ok: false, error: "x" } });

    const list = await groups.list(ws);
    const by = new Map(list.items.map((g) => [g.name, g]));
    expect(by.get("Ventas VE")).toMatchObject({ inactive: false, lastActivityAt: t1.toISOString(), lastSentAt: null });
    expect(by.get("Grupo dormido")).toMatchObject({ inactive: true, lastSendOk: false });
    expect(by.get("Grupo dormido")?.lastSentAt).toBeTruthy();
    expect(by.get("Nuevo")).toMatchObject({ inactive: false });
    expect(alive.id).toBeTruthy();
  });

  it("isDeadGroup cuenta desde el último mensaje, o desde que se vigila", () => {
    const now = Date.UTC(2026, 10, 5);
    const day = 86_400_000;
    expect(isDeadGroup({ lastMessageAt: null, watchedSince: new Date(now - 10 * day) }, now)).toBe(false);
    expect(isDeadGroup({ lastMessageAt: null, watchedSince: new Date(now - 31 * day) }, now)).toBe(true);
    expect(isDeadGroup({ lastMessageAt: new Date(now - 2 * day), watchedSince: new Date(now - 90 * day) }, now)).toBe(false);
  });
});
