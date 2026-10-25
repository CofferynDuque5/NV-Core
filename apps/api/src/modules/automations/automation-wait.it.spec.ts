import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AutomationRunnerService } from "./automation-runner.service";
import { AutomationsService } from "./automations.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Nodo «esperar» contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const mk = () => {
    const sent: string[] = [];
    let handler: ((p: unknown) => Promise<void>) | null = null;
    const svc = new AutomationRunnerService(
      { on: (_e: string, h: (p: unknown) => Promise<void>) => ((handler = h), () => undefined) } as never,
      prisma as never,
      { sendByChannel: vi.fn(async (_w: string, _c: string, _to: string, body: string) => void sent.push(body)) } as never,
      {} as never,
      { create: vi.fn() } as never,
      { isHandleOptedOut: vi.fn(async () => false) } as never,
    );
    svc.onModuleInit();
    svc.onModuleDestroy();
    return { svc, sent, fire: (ws: string, text: string) => handler!({ workspaceSlug: ws, channel: "wa", contactHandle: "+57300", contactName: "Ana", text }) };
  };

  it("la espera sobrevive a un «reinicio» y solo un proceso la reanuda", async () => {
    const ws = `it-wait-${Date.now()}`;
    await prisma.automation.create({
      data: {
        workspaceSlug: ws, name: "Seguimiento", status: "activo",
        nodes: [
          { id: "t", type: "trigger", label: "Mensaje", config: {} },
          { id: "w", type: "wait", label: "Esperar", config: { duration: "5m" } },
          { id: "m", type: "action", label: "Msg", config: { kind: "send_message", body: "¿Seguimos?" } },
        ],
        edges: [{ id: "e1", from: "t", to: "w" }, { id: "e2", from: "w", to: "m" }],
      },
    });
    const first = mk();
    await first.fire(ws, "hola");
    await first.fire(ws, "hola de nuevo");
    expect(first.sent).toHaveLength(0);
    expect(await prisma.automationWait.count({ where: { workspaceSlug: ws, status: "pending" } })).toBe(1);

    // Proceso nuevo tras reinicio: dos instancias barren a la vez.
    const a = mk();
    const b = mk();
    const at = new Date(Date.now() + 6 * 60_000);
    const [ra, rb] = await Promise.all([a.svc.resumeDue(at), b.svc.resumeDue(at)]);
    expect(ra + rb).toBe(1);
    expect([...a.sent, ...b.sent]).toEqual(["¿Seguimos?"]);
    const w = await prisma.automationWait.findFirst({ where: { workspaceSlug: ws } });
    expect(w!.status).toBe("done");
  });

  it("guarda el historial y lo devuelve por workspace, más reciente primero", async () => {
    const ws = `it-runs-${Date.now()}`;
    const flow = await prisma.automation.create({
      data: {
        workspaceSlug: ws, name: "Saludo", status: "activo",
        nodes: [
          { id: "t", type: "trigger", label: "Mensaje", config: {} },
          { id: "m", type: "action", label: "Hola", config: { kind: "send_message", body: "Hola {{nombre}}" } },
        ],
        edges: [{ id: "e1", from: "t", to: "m" }],
      },
    });
    const r = mk();
    await r.fire(ws, "hola");
    await r.fire(ws, "otra vez"); // pausa anti-spam → omitida
    const api = new AutomationsService(prisma as never, { record: vi.fn() } as never, {} as never);
    const runs = await api.runs(ws, flow.id);
    expect(runs.map((x) => x.status)).toEqual(["skipped", "ok"]);
    expect(runs[1]!.steps.map((x) => x.nodeId)).toEqual(["t", "m"]);
    expect(runs[1]!.steps[1]!.note).toBe("Mensaje enviado: «Hola Ana»");
    // Otro workspace no puede leer este historial.
    await expect(api.runs(`${ws}-otro`, flow.id)).rejects.toThrow(/no encontrada/);

    // La limpieza borra lo que tiene más de 30 días.
    await prisma.automationRun.updateMany({ where: { automationId: flow.id }, data: { startedAt: new Date(Date.now() - 31 * 86_400_000) } });
    await mk().svc.resumeDue(new Date());
    expect(await prisma.automationRun.count({ where: { automationId: flow.id } })).toBe(0);
  });
});
