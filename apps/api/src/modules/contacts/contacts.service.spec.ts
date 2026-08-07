import { describe, expect, it, vi } from "vitest";

import { ContactsService } from "./contacts.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Note {
  id: string;
  workspaceSlug: string;
  contactId: string;
  body: string;
  author: string;
  createdAt: Date;
}

function makeService(opts: { contactExists?: boolean; notes?: Note[] } = {}) {
  const notes = [...(opts.notes ?? [])];
  let seq = notes.length;
  const prisma = {
    enabled: true,
    contact: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
        opts.contactExists === false ? null : { id: where.id, workspaceSlug: where.workspaceSlug },
      ),
    },
    contactNote: {
      findMany: vi.fn(async ({ where }: { where: { workspaceSlug: string; contactId: string } }) =>
        notes.filter((n) => n.workspaceSlug === where.workspaceSlug && n.contactId === where.contactId),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `n${++seq}`, createdAt: new Date(0), ...data } as Note;
        notes.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; contactId: string; workspaceSlug: string } }) => {
        const i = notes.findIndex((n) => n.id === where.id && n.contactId === where.contactId && n.workspaceSlug === where.workspaceSlug);
        if (i < 0) return { count: 0 };
        notes.splice(i, 1);
        return { count: 1 };
      }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new ContactsService(prisma as unknown as PrismaService, audit as never);
  return { service, notes };
}

describe("ContactsService.list (server-side search + stage)", () => {
  function makeListService() {
    const findMany = vi.fn(async (_args: Record<string, unknown>) => [] as unknown[]);
    const count = vi.fn(async (_args: Record<string, unknown>) => 0);
    const prisma = { enabled: true, contact: { findMany, count } };
    const service = new ContactsService(prisma as unknown as PrismaService, { record: vi.fn() } as never);
    return { service, findMany, count };
  }

  it("applies pagination only when there are no filters", async () => {
    const { service, findMany } = makeListService();
    await service.list("w1", { page: 2, pageSize: 50 } as never);
    const args = findMany.mock.calls[0]![0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(args.where).toEqual({ workspaceSlug: "w1" });
    expect(args.skip).toBe(50); // (2-1)*50
    expect(args.take).toBe(50);
  });

  it("builds an OR search across name/company/email/phone/tags", async () => {
    const { service, findMany } = makeListService();
    await service.list("w1", { page: 1, pageSize: 100, q: "  ana  " } as never);
    const where = (findMany.mock.calls[0]![0] as { where: { OR?: unknown[] } }).where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toEqual([
      { name: { contains: "ana", mode: "insensitive" } },
      { company: { contains: "ana", mode: "insensitive" } },
      { email: { contains: "ana", mode: "insensitive" } },
      { phone: { contains: "ana", mode: "insensitive" } },
      { tags: { has: "ana" } },
    ]);
  });

  it("filters by stage in the where clause", async () => {
    const { service, findMany } = makeListService();
    await service.list("w1", { page: 1, pageSize: 100, stage: "Cliente" } as never);
    const where = (findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.stage).toBe("Cliente");
  });

  it("returns an empty list when the DB is disabled", async () => {
    const prisma = { enabled: false, contact: { findMany: vi.fn(), count: vi.fn() } };
    const service = new ContactsService(prisma as unknown as PrismaService, { record: vi.fn() } as never);
    const res = await service.list("w1", { page: 1, pageSize: 100 } as never);
    expect(res.items).toEqual([]);
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });
});

describe("ContactsService notes", () => {
  it("adds a note authored by the actor", async () => {
    const { service } = makeService();
    const note = await service.addNote("w1", "ana@x", "c1", "Llamé al cliente");
    expect(note.body).toBe("Llamé al cliente");
    expect(note.author).toBe("ana@x");
    expect(note.contactId).toBe("c1");
  });

  it("lists a contact's notes", async () => {
    const seed: Note = { id: "n1", workspaceSlug: "w1", contactId: "c1", body: "Hola", author: "a", createdAt: new Date(0) };
    const { service } = makeService({ notes: [seed] });
    const list = await service.notes("w1", "c1");
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe("Hola");
  });

  it("throws when adding a note to a missing contact", async () => {
    const { service } = makeService({ contactExists: false });
    await expect(service.addNote("w1", "a", "nope", "x")).rejects.toThrow(/no encontrado/);
  });

  it("removes a note, and errors on a missing one", async () => {
    const seed: Note = { id: "n1", workspaceSlug: "w1", contactId: "c1", body: "Hola", author: "a", createdAt: new Date(0) };
    const { service, notes } = makeService({ notes: [seed] });
    await service.removeNote("w1", "a", "c1", "n1");
    expect(notes).toHaveLength(0);
    await expect(service.removeNote("w1", "a", "c1", "n1")).rejects.toThrow(/no encontrada/);
  });
});
