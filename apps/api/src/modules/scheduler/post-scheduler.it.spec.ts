import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { InboxService } from "../inbox/inbox.module";
import { PostScheduler } from "./post-scheduler.service";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Publicaciones programadas e Inbox contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const mk = (publish: () => Promise<unknown>) => {
    const providers = {
      providerForChannel: (c: string) => ({ fb: "facebook", ig: "instagram" })[c],
      publish: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return publish();
      }),
    };
    const scheduler = new PostScheduler(
      { enabled: false, register: vi.fn() } as never,
      prisma as never,
      { record: vi.fn() } as never,
      providers as never,
    );
    return { scheduler, providers };
  };

  it("sin Redis: el barrido publica una vez aunque corra en dos procesos, y registra los fallos", async () => {
    const ws = `it-post-${Date.now()}`;
    const past = new Date(Date.now() - 60_000);
    const ok = await prisma.post.create({ data: { workspaceSlug: ws, channel: "fb", title: "OK", status: "scheduled", scheduledAt: past } });
    const bad = await prisma.post.create({ data: { workspaceSlug: ws, channel: "x", title: "Sin canal", status: "scheduled", scheduledAt: past } });
    const later = await prisma.post.create({
      data: { workspaceSlug: ws, channel: "fb", title: "Futuro", status: "scheduled", scheduledAt: new Date(Date.now() + 3600_000) },
    });

    const a = mk(async () => ({ ok: true, id: "fb_1" }));
    const b = mk(async () => ({ ok: true, id: "fb_1" }));
    await Promise.all([a.scheduler.sweep(), b.scheduler.sweep()]);

    const calls = a.providers.publish.mock.calls.length + b.providers.publish.mock.calls.length;
    expect(calls).toBe(1);
    const rows = await prisma.post.findMany({ where: { workspaceSlug: ws } });
    expect(rows.find((r) => r.id === ok.id)!.status).toBe("sent");
    expect(rows.find((r) => r.id === bad.id)!.status).toBe("error");
    expect(rows.find((r) => r.id === later.id)!.status).toBe("scheduled");
    const notes = await prisma.notification.findMany({ where: { workspaceSlug: ws } });
    expect(notes.map((n) => n.type).sort()).toEqual(["error", "success"]);
  });

  it("una publicación interrumpida por un reinicio queda como error sin confirmar, sin reenviarse", async () => {
    const ws = `it-post-stuck-${Date.now()}`;
    const old = new Date(Date.now() - 30 * 60_000);
    const p = await prisma.post.create({
      data: { workspaceSlug: ws, channel: "fb", title: "Cortada", status: "publishing", scheduledAt: old, publishStartedAt: old },
    });
    const a = mk(async () => ({ ok: true }));
    await a.scheduler.sweep();
    expect(a.providers.publish).not.toHaveBeenCalled();
    expect((await prisma.post.findUnique({ where: { id: p.id } }))!.status).toBe("error");
  });

  it("Inbox: una conversación antigua con un mensaje nuevo sale primero", async () => {
    const ws = `it-inbox-${Date.now()}`;
    const old = await prisma.conversation.create({
      data: { workspaceSlug: ws, channel: "wa", contactName: "Antigua", createdAt: new Date(Date.now() - 86_400_000) },
    });
    await prisma.conversation.create({ data: { workspaceSlug: ws, channel: "wa", contactName: "Nueva" } });
    await prisma.message.create({ data: { conversationId: old.id, direction: "in", text: "hola de nuevo" } });

    const inbox = new InboxService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    const res = await inbox.conversations(ws);
    expect(res.items.map((c) => c.contactName)).toEqual(["Antigua", "Nueva"]);
    expect(res.total).toBe(2);
  });
});
