import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { findDuplicateGroups, mergeContactFields } from "./contact-merge";
import { ContactsService } from "./contacts.module";

const base = {
  name: "Ana",
  phone: null,
  email: null,
  company: null,
  tags: [],
  stage: "Lead",
  lastContactAt: null,
  optOutAt: null,
  optOutSource: null,
  consentAt: null,
  consentSource: null,
  attribution: null,
};

describe("contact merge helpers", () => {
  it("groups by phone (last 9 digits) and email, chaining matches", () => {
    const t = (n: number) => new Date(2026, 0, n);
    const groups = findDuplicateGroups([
      { id: "a", phone: "+58 412 111 0000", email: null, createdAt: t(1) },
      { id: "b", phone: "04121110000", email: "ana@x.com", createdAt: t(2) },
      { id: "c", phone: null, email: "ANA@x.com ", createdAt: t(3) },
      { id: "d", phone: "+57 300 000 0001", email: null, createdAt: t(4) },
    ]);
    expect(groups.map((g) => g.map((c) => c.id))).toEqual([["a", "b", "c"]]);
  });

  it("fills the kept contact's gaps, joins tags and keeps any opt-out", () => {
    const out = mergeContactFields(
      { ...base, id: "k", name: "+58 412 111 0000", phone: "+584121110000", tags: ["vip"], createdAt: new Date() },
      [
        {
          ...base,
          id: "o",
          name: "Ana Pérez",
          email: "ana@x.com",
          tags: ["vip", "caracas"],
          optOutAt: new Date(2026, 1, 1),
          optOutSource: "keyword",
          createdAt: new Date(),
        },
      ],
    );
    expect(out).toMatchObject({
      name: "Ana Pérez",
      phone: "+584121110000",
      email: "ana@x.com",
      tags: ["vip", "caracas"],
      optOutSource: "keyword",
    });
  });
});

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Contactos: importar con vista previa y fusionar contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const service = new ContactsService(
    prisma as never,
    { record: vi.fn() } as never,
    { assertWithinLimit: vi.fn() } as never,
    {} as never,
  );

  it("la vista previa no guarda nada y omite teléfonos y correos que ya están", async () => {
    const ws = `it-cimp-${Date.now()}`;
    await prisma.contact.create({ data: { workspaceSlug: ws, name: "Ya está", phone: "+58 412-111-0000", tags: [] } });
    const csv = "name,phone,email\nAna,584121110000,\nLuis,+57 300 0000001,luis@x.com\nLuis bis,,LUIS@x.com\n,123,";
    const dry = await service.importCsv(ws, "a@nv.tv", csv, true);
    expect(dry).toMatchObject({ created: 1, skipped: 2, dryRun: true });
    expect(dry.errors).toHaveLength(1);
    expect(await prisma.contact.count({ where: { workspaceSlug: ws } })).toBe(1);
    const real = await service.importCsv(ws, "a@nv.tv", csv);
    expect(real.created).toBe(1);
    expect(await prisma.contact.count({ where: { workspaceSlug: ws } })).toBe(2);
  });

  it("fusiona: mueve notas, tareas, cobros y secuencias; borra los otros", async () => {
    const ws = `it-cmerge-${Date.now()}`;
    const keep = await prisma.contact.create({ data: { workspaceSlug: ws, name: "Ana", phone: "+584121110000", tags: ["vip"] } });
    const dup = await prisma.contact.create({
      data: { workspaceSlug: ws, name: "Ana Pérez", phone: "04121110000", email: "ana@x.com", tags: ["caracas"] },
    });
    const other = await prisma.contact.create({ data: { workspaceSlug: `${ws}-x`, name: "Otra marca", phone: "04121110000", tags: [] } });
    await prisma.contactNote.create({ data: { workspaceSlug: ws, contactId: dup.id, body: "llamar", author: "a@nv.tv" } });
    await prisma.task.create({ data: { workspaceSlug: ws, title: "Seguimiento", contactId: dup.id, createdBy: "a@nv.tv" } as never });
    await prisma.paymentRequest.create({
      data: { workspaceSlug: ws, concept: "Plan", amount: 10, currency: "USD", contactId: dup.id, createdBy: "a@nv.tv" },
    });

    const { groups } = await service.duplicates(ws);
    expect(groups.map((g) => g.map((c) => c.id))).toEqual([[keep.id, dup.id]]);

    const merged = await service.merge(ws, "a@nv.tv", keep.id, [dup.id]);
    expect(merged).toMatchObject({ id: keep.id, email: "ana@x.com", tags: ["vip", "caracas"] });
    expect(await prisma.contact.findUnique({ where: { id: dup.id } })).toBeNull();
    expect(await prisma.contactNote.count({ where: { contactId: keep.id } })).toBe(1);
    expect(await prisma.task.count({ where: { contactId: keep.id } })).toBe(1);
    expect(await prisma.paymentRequest.count({ where: { contactId: keep.id } })).toBe(1);
    expect((await service.duplicates(ws)).groups).toEqual([]);
    // Another brand's contact can't be merged in.
    await expect(service.merge(ws, "a@nv.tv", keep.id, [other.id])).rejects.toThrow("ya no existe");
  });
});
