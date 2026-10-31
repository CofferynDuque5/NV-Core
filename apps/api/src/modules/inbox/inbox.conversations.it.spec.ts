import { PrismaClient } from "@prisma/client";
import { INBOX_UNASSIGNED } from "@nv/domain";
import { describe, expect, it } from "vitest";

import { InboxService } from "./inbox.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Inbox: búsqueda y páginas contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const inbox = new InboxService(prisma as never, {} as never, {} as never, {} as never, {} as never);

  async function seed(ws: string) {
    const t0 = Date.UTC(2026, 0, 1);
    // 7 threads; activity grows with i, so the newest is c6.
    for (let i = 0; i < 7; i++) {
      const c = await prisma.conversation.create({
        data: {
          workspaceSlug: ws,
          channel: i % 2 ? "tg" : "wa",
          contactName: `Cliente ${i}`,
          contactHandle: `5730000000${i}`,
          resolved: i === 3,
          assignee: i === 5 ? "ana@nv.tv" : null,
          labels: i === 2 ? ["ventas_50%"] : [],
          createdAt: new Date(t0 + i * 1000),
        },
      });
      await prisma.message.create({
        data: {
          conversationId: c.id,
          direction: "in",
          text: i === 1 ? "Quiero el precio del plan anual" : `hola ${i}`,
          createdAt: new Date(t0 + 60_000 + i * 1000),
        },
      });
    }
    // An old thread with a brand-new message jumps to the top.
    const c0 = await prisma.conversation.findFirst({ where: { workspaceSlug: ws, contactName: "Cliente 0" } });
    await prisma.message.create({
      data: { conversationId: c0!.id, direction: "in", text: "sigo aquí", createdAt: new Date(t0 + 3_600_000) },
    });
  }

  it("pagina por actividad sin repetir ni saltarse conversaciones", async () => {
    const ws = `it-inbox-${Date.now()}`;
    await seed(ws);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await inbox.conversations(ws, { limit: 3, cursor });
      expect(page.total).toBe(7);
      expect(page.openCount).toBe(6);
      seen.push(...page.items.map((c) => c.contactName));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(["Cliente 0", "Cliente 6", "Cliente 5", "Cliente 4", "Cliente 3", "Cliente 2", "Cliente 1"]);
  });

  it("busca en nombre, teléfono, etiquetas y texto de mensajes", async () => {
    const ws = `it-inbox-q-${Date.now()}`;
    await seed(ws);
    const names = async (q: string) => (await inbox.conversations(ws, { q })).items.map((c) => c.contactName);
    expect(await names("cliente 4")).toEqual(["Cliente 4"]);
    expect(await names("57300000006")).toEqual(["Cliente 6"]);
    expect(await names("precio")).toEqual(["Cliente 1"]);
    // LIKE wildcards are literal: "_50%" only matches the label that has them.
    expect(await names("_50%")).toEqual(["Cliente 2"]);
    expect(await names("nadie")).toEqual([]);
  });

  it("busca sin importar tildes ni mayúsculas", async () => {
    const ws = `it-inbox-acc-${Date.now()}`;
    await prisma.conversation.create({
      data: {
        workspaceSlug: ws,
        channel: "wa",
        contactName: "María Ramírez",
        labels: ["Atención"],
        messages: { create: [{ direction: "in", text: "Pagué por Pago Móvil" }] },
      },
    });
    const names = async (q: string) => (await inbox.conversations(ws, { q })).items.map((c) => c.contactName);
    expect(await names("maria ramirez")).toEqual(["María Ramírez"]);
    expect(await names("MARÍA")).toEqual(["María Ramírez"]);
    expect(await names("atencion")).toEqual(["María Ramírez"]);
    expect(await names("pague por pago movil")).toEqual(["María Ramírez"]);
  });

  it("filtra por canal, estado y responsable, y aísla el workspace", async () => {
    const ws = `it-inbox-f-${Date.now()}`;
    await seed(ws);
    await seed(`${ws}-otro`);
    const get = (q: Parameters<InboxService["conversations"]>[1]) => inbox.conversations(ws, q);
    expect((await get({ channel: "tg" })).total).toBe(3);
    expect((await get({ status: "resolved" })).items.map((c) => c.contactName)).toEqual(["Cliente 3"]);
    expect((await get({ status: "open" })).total).toBe(6);
    expect((await get({ assignee: "ana@nv.tv" })).items.map((c) => c.contactName)).toEqual(["Cliente 5"]);
    expect((await get({ assignee: INBOX_UNASSIGNED })).total).toBe(6);
    expect((await get({})).total).toBe(7);
  });

  it("un cursor inválido se ignora y devuelve la primera página", async () => {
    const ws = `it-inbox-c-${Date.now()}`;
    await seed(ws);
    const page = await inbox.conversations(ws, { limit: 2, cursor: "no-es-un-cursor" });
    expect(page.items.map((c) => c.contactName)).toEqual(["Cliente 0", "Cliente 6"]);
  });
});
