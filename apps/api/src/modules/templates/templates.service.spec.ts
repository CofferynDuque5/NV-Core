import { describe, expect, it, vi } from "vitest";

import { TemplatesService } from "./templates.module";
import type { PrismaService } from "../../prisma/prisma.service";

type Row = { id: string; workspaceSlug: string; name: string; category: string; body: string };

function makeService(seed: { name: string; category?: string; body?: string }[] = []) {
  const rows: Row[] = seed.map((t, i) => ({
    id: "t" + i,
    workspaceSlug: "w1",
    name: t.name,
    category: t.category ?? "General",
    body: t.body ?? "cuerpo",
  }));
  const created: Row[] = [];
  const prisma = {
    enabled: true,
    template: {
      findMany: vi.fn(async (args: { select?: { name?: boolean }; take?: number; cursor?: { id: string } }) => {
        if (args.select?.name) return rows.map((r) => ({ name: r.name }));
        let list = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
        if (args.cursor) list = list.filter((r) => r.id > args.cursor!.id);
        return list.slice(0, args.take ?? list.length);
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "n" + created.length, ...data } as Row;
        created.push(row);
        rows.push(row);
        return row;
      }),
    },
  };
  const service = new TemplatesService(prisma as unknown as PrismaService, { record: vi.fn() } as never);
  return { service, created };
}

describe("TemplatesService import/export CSV", () => {
  it("creates new templates, skips duplicate names, and reports errors", async () => {
    const { service, created } = makeService([{ name: "Bienvenida" }]);
    const csv =
      "name,category,body\n" +
      "Promo,Marketing,¡Oferta!\n" + // new
      "Bienvenida,General,Hola\n" + // duplicate name → skipped
      "Sin cuerpo,General,\n" + // missing body → error
      ",General,Cuerpo huérfano"; // missing name → error
    const res = await service.importCsv("w1", "actor", csv);
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(2);
    expect(created[0]).toMatchObject({ name: "Promo", category: "Marketing", body: "¡Oferta!" });
  });

  it("accepts Spanish headers and defaults the category", async () => {
    const { service, created } = makeService();
    await service.importCsv("w1", "actor", "nombre,contenido\nRecordatorio,Tu cita es mañana");
    expect(created[0]).toMatchObject({ name: "Recordatorio", body: "Tu cita es mañana", category: "General" });
  });

  it("dedupes case-insensitively across the import itself", async () => {
    const { service, created } = makeService();
    await service.importCsv("w1", "actor", "name,body\nHola,uno\nhola,dos");
    expect(created).toHaveLength(1);
  });

  it("exports templates as CSV with a header", async () => {
    const { service } = makeService([
      { name: "Uno", category: "A", body: "cuerpo uno" },
      { name: "Dos", category: "B", body: "cuerpo dos" },
    ]);
    const csv = await service.exportCsv("w1");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,category,body");
    expect(csv).toContain("Uno");
    expect(csv).toContain("Dos");
    expect(lines).toHaveLength(3);
  });

  it("quotes bodies with commas/newlines so they round-trip", async () => {
    const { service } = makeService([{ name: "Multi", category: "X", body: "línea 1\nlínea 2, con coma" }]);
    const csv = await service.exportCsv("w1");
    expect(csv).toContain('"línea 1\nlínea 2, con coma"');
  });
});
