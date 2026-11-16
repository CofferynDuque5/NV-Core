import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PanelActivityService } from "./panel-activity.service";

const url = process.env.IT_DATABASE_URL;
const PHONE = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

describe.skipIf(!url)("Uso del panel: visitas contra PostgreSQL real", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const svc = new PanelActivityService(prisma as never);

  it("cuenta páginas por sección, tiempo y dispositivo; ignora un id ajeno; separa la demo", async () => {
    const stamp = Date.now();
    const ana = await prisma.user.create({ data: { email: `ana_${stamp}@nv.tv`, name: "Ana", passwordHash: "x" } });
    const demo = await prisma.user.create({ data: { email: `demo_${stamp}@nv.tv`, name: "Demo", passwordHash: "x", demo: true } });
    const sid = `s${stamp}abc`;
    const t0 = new Date();
    await svc.ping({ userId: ana.id }, sid, "/w/mi-marca/campanas", { ip: "10.0.0.1", userAgent: PHONE }, t0);
    await svc.ping({ userId: ana.id }, sid, "/w/mi-marca/campanas", {}, new Date(t0.getTime() + 60_000));
    await svc.ping({ userId: ana.id }, sid, "/w/mi-marca/inbox", {}, new Date(t0.getTime() + 120_000));
    await svc.ping({ userId: ana.id }, sid, "/w/mi-marca/campanas", {}, new Date(t0.getTime() + 180_000));
    // Another user can't write into Ana's visit.
    await svc.ping({ userId: demo.id, demo: true }, sid, "/w/nv-demo/grupos", {}, new Date(t0.getTime() + 200_000));
    await svc.ping({ userId: demo.id, demo: true }, `d${stamp}xyz`, "/w/nv-demo", { ip: "10.0.0.9", userAgent: null }, t0);
    // A bad id is ignored.
    await svc.ping({ userId: ana.id }, "x", "/w/mi-marca", {}, t0);

    const row = await prisma.panelSession.findUniqueOrThrow({ where: { id: sid } });
    expect(row).toMatchObject({
      userId: ana.id,
      device: "Chrome · Android",
      deviceKind: "movil",
      ip: "10.0.0.1",
      workspaceSlug: "mi-marca",
      pageViews: 3,
      lastPath: "/w/mi-marca/campanas",
      demo: false,
    });
    expect(row.sections).toEqual({ campanas: 2, inbox: 1 });
    expect(row.lastAt.getTime() - row.startedAt.getTime()).toBe(180_000);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).lastSeenAt).not.toBeNull();

    const overview = await svc.overview(7, new Date(t0.getTime() + 300_000));
    const mine = overview.sessions.filter((s) => s.userId === ana.id || s.userId === demo.id);
    expect(mine).toHaveLength(2);
    expect(mine.find((s) => s.demo)).toMatchObject({ email: demo.email, ip: "10.0.0.9", sections: { dashboard: 1 } });
    expect(mine.find((s) => !s.demo)).toMatchObject({ email: ana.email, name: "Ana", pageViews: 3 });
  });
});
