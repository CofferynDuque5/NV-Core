import { describe, expect, it, vi } from "vitest";

import { ConsentService, isOptOutMessage, phoneKey } from "./consent.service";

describe("isOptOutMessage", () => {
  it("reconoce pedidos de baja escritos solos", () => {
    for (const t of ["BAJA", "baja.", "Stop!", "  darme de baja ", "No más mensajes", "UNSUBSCRIBE"]) {
      expect(isOptOutMessage(t)).toBe(true);
    }
  });

  it("no da de baja frases normales que contienen la palabra", () => {
    for (const t of ["no puedo cancelar mi pedido", "¿el precio baja mañana?", "stop motion", "hola", ""]) {
      expect(isOptOutMessage(t)).toBe(false);
    }
  });
});

describe("phoneKey", () => {
  it("compara por los últimos 9 dígitos", () => {
    expect(phoneKey("+57 300-111-2233")).toBe(phoneKey("573001112233"));
    expect(phoneKey("123")).toBeNull();
  });
});

function make(contacts: Record<string, unknown>[]) {
  const rows = contacts.map((c) => ({ ...c }));
  let handler: ((p: unknown) => Promise<void>) | null = null;
  const prisma = {
    enabled: true,
    contact: {
      findMany: vi.fn(async ({ where }: { where: { workspaceSlug: string } }) =>
        rows.filter((r) => r.workspaceSlug === where.workspaceSlug),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `c${rows.length + 1}`, ...data };
        rows.push(r);
        return r;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
        rows.filter((r) => where.id.in.includes(r.id as string)).forEach((r) => Object.assign(r, data));
        return { count: where.id.in.length };
      }),
    },
    sequenceEnrollment: { updateMany: vi.fn(async () => ({ count: 1 })) },
    notification: { create: vi.fn(async () => ({})) },
  };
  const events = { on: vi.fn((_e: string, h: (p: unknown) => Promise<void>) => ((handler = h), () => undefined)) };
  const svc = new ConsentService(prisma as never, events as never, { record: vi.fn() } as never);
  svc.onModuleInit();
  const fire = (text: string, handle = "+573001112233") =>
    handler!({ workspaceSlug: "ws", contactHandle: handle, contactName: "Ana", text });
  return { svc, rows, prisma, fire };
}

describe("ConsentService", () => {
  it("un «BAJA» marca al contacto, detiene sus secuencias y avisa", async () => {
    const { rows, prisma, fire, svc } = make([{ id: "c1", workspaceSlug: "ws", phone: "+57 300 111 2233", optOutAt: null }]);
    await fire("BAJA");
    expect(rows[0]!.optOutAt).toBeInstanceOf(Date);
    expect(rows[0]!.optOutSource).toBe("keyword");
    expect(prisma.sequenceEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "opted_out", nextRunAt: null } }),
    );
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(await svc.isHandleOptedOut("ws", "573001112233")).toBe(true);
  });

  it("si no existe el contacto, lo crea ya dado de baja", async () => {
    const { rows, fire } = make([]);
    await fire("stop", "+573009998877");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: "+573009998877", optOutSource: "keyword" });
  });

  it("un mensaje normal no cambia nada", async () => {
    const { rows, prisma, fire } = make([{ id: "c1", workspaceSlug: "ws", phone: "+573001112233", optOutAt: null }]);
    await fire("hola, ¿precio?");
    expect(rows[0]!.optOutAt).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("no mezcla workspaces", async () => {
    const { svc } = make([{ id: "c1", workspaceSlug: "otro", phone: "+573001112233", optOutAt: new Date() }]);
    expect(await svc.isHandleOptedOut("ws", "+573001112233")).toBe(false);
  });
});
