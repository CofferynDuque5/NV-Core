import { HttpException, HttpStatus } from "@nestjs/common";
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
  const service = new ContactsService(
    prisma as unknown as PrismaService,
    audit as never,
    { assertWithinLimit: vi.fn() } as never,
  );
  return { service, notes };
}

describe("ContactsService.list (server-side search + stage)", () => {
  function makeListService() {
    const findMany = vi.fn(async (_args: Record<string, unknown>) => [] as unknown[]);
    const count = vi.fn(async (_args: Record<string, unknown>) => 0);
    const prisma = { enabled: true, contact: { findMany, count } };
    const service = new ContactsService(
      prisma as unknown as PrismaService,
      { record: vi.fn() } as never,
      { assertWithinLimit: vi.fn() } as never,
    );
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
    const service = new ContactsService(
      prisma as unknown as PrismaService,
      { record: vi.fn() } as never,
      { assertWithinLimit: vi.fn() } as never,
    );
    const res = await service.list("w1", { page: 1, pageSize: 100 } as never);
    expect(res.items).toEqual([]);
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });
});

describe("ContactsService import/export CSV", () => {
  type Row = { id: string; workspaceSlug: string; name: string; email: string | null; tags: string[]; stage: string; createdAt: Date; phone?: string | null; company?: string | null };
  function makeIO(
    seed: { name: string; email?: string | null }[] = [],
    assertWithinLimit: (ws: string, resource: string, count: number) => Promise<void> = async () =>
      undefined,
  ) {
    const rows: Row[] = seed.map((c, i) => ({
      id: "c" + i, workspaceSlug: "w1", name: c.name, email: c.email ?? null, tags: [], stage: "Lead", createdAt: new Date(0),
    }));
    const created: Row[] = [];
    const prisma = {
      enabled: true,
      contact: {
        findMany: vi.fn(async (args: { select?: { email?: boolean }; take?: number; cursor?: { id: string } }) => {
          if (args.select?.email) return rows.filter((r) => r.email).map((r) => ({ email: r.email }));
          let list = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
          if (args.cursor) list = list.filter((r) => r.id > args.cursor!.id);
          return list.slice(0, args.take ?? list.length);
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "n" + created.length, createdAt: new Date(0), ...data } as Row;
          created.push(row);
          rows.push(row);
          return row;
        }),
      },
    };
    const plans = { assertWithinLimit: vi.fn(assertWithinLimit) };
    const service = new ContactsService(
      prisma as unknown as PrismaService,
      { record: vi.fn() } as never,
      plans as never,
    );
    return { service, created, plans };
  }

  it("creates new contacts, skips duplicate emails, and reports name errors", async () => {
    const { service, created } = makeIO([{ name: "Existing", email: "dup@x.com" }]);
    const csv = "name,email,stage\nAna,ana@x.com,Cliente\nBob,dup@x.com,Lead\n,no@x.com,Lead";
    const res = await service.importCsv("w1", "actor", csv);
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1); // dup@x.com already exists
    expect(res.errors).toHaveLength(1); // missing name
    expect(created[0]).toMatchObject({ name: "Ana", email: "ana@x.com", stage: "Cliente" });
  });

  it("defaults an unknown stage to Lead and splits tags", async () => {
    const { service, created } = makeIO();
    await service.importCsv("w1", "actor", 'name,stage,tags\nX,Zzz,"a;b;c"');
    expect(created[0]).toMatchObject({ stage: "Lead", tags: ["a", "b", "c"] });
  });

  it("accepts Spanish headers (nombre/correo/etapa)", async () => {
    const { service, created } = makeIO();
    await service.importCsv("w1", "actor", "nombre,correo,etapa\nLuisa,luisa@x.com,Cliente");
    expect(created[0]).toMatchObject({ name: "Luisa", email: "luisa@x.com", stage: "Cliente" });
  });

  it("enforces the plan limit with the count of NEW contacts (dupes excluded)", async () => {
    const { service, plans } = makeIO([{ name: "Existing", email: "dup@x.com" }]);
    // 2 new + 1 duplicate email → gate should be asked to fit exactly 2.
    await service.importCsv("w1", "actor", "name,email\nAna,ana@x.com\nBob,dup@x.com\nCleo,cleo@x.com");
    expect(plans.assertWithinLimit).toHaveBeenCalledWith("w1", "contacts", 2);
  });

  it("rejects the whole import (402) before writing when it would overflow the plan", async () => {
    const { service, created } = makeIO([], async () => {
      throw new HttpException("Límite alcanzado", HttpStatus.PAYMENT_REQUIRED);
    });
    await expect(
      service.importCsv("w1", "actor", "name,email\nAna,ana@x.com\nBob,bob@x.com"),
    ).rejects.toBeInstanceOf(HttpException);
    expect(created).toHaveLength(0); // gate runs before any write
  });

  it("exports contacts as CSV with a header", async () => {
    const { service } = makeIO([{ name: "Ana", email: "ana@x.com" }, { name: "Bob" }]);
    const csv = await service.exportCsv("w1");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,phone,email,company,tags,stage,createdAt");
    expect(csv).toContain("Ana");
    expect(csv).toContain("Bob");
    expect(lines).toHaveLength(3); // header + 2
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
