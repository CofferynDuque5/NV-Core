import { describe, expect, it, vi } from "vitest";

import { DesignsService, type UpdateDesignDto } from "./designs.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Row {
  id: string;
  workspaceSlug: string;
  name: string;
  format: string;
  layers: unknown;
  updatedAt: Date;
}

function makeService(seed: Row[] = []) {
  const rows = [...seed];
  const prisma = {
    enabled: true,
    design: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
        rows.find((r) => r.id === where.id && r.workspaceSlug === where.workspaceSlug) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { workspaceSlug: string } }) =>
        rows.filter((r) => r.workspaceSlug === where.workspaceSlug),
      ),
      count: vi.fn(async ({ where }: { where: { workspaceSlug: string } }) =>
        rows.filter((r) => r.workspaceSlug === where.workspaceSlug).length,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `d${rows.length + 1}`, updatedAt: new Date(0), ...data } as Row;
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.workspaceSlug === where.workspaceSlug);
        if (i < 0) return { count: 0 };
        rows.splice(i, 1);
        return { count: 1 };
      }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new DesignsService(prisma as unknown as PrismaService, audit as never);
  return { service, rows, audit };
}

function baseRow(over: Partial<Row> = {}): Row {
  return {
    id: "d1",
    workspaceSlug: "w1",
    name: "Promo",
    format: "square",
    layers: [],
    updatedAt: new Date(0),
    ...over,
  };
}

describe("DesignsService", () => {
  it("creates a design with layers and default format", async () => {
    const { service } = makeService();
    const res = await service.create("w1", "actor@x", {
      name: "Lanzamiento",
      layers: [{ id: "l1", type: "text", x: 10, y: 10, w: 200, h: 60, text: "Hola" }],
    });
    expect(res.name).toBe("Lanzamiento");
    expect(res.format).toBe("square");
    expect(res.layers).toHaveLength(1);
  });

  it("updates name/format/layers (partial)", async () => {
    const { service, rows } = makeService([baseRow({ name: "Keep" })]);
    const dto: UpdateDesignDto = {
      format: "story",
      layers: [{ id: "l1", type: "rect", x: 0, y: 0, w: 100, h: 100, fill: "#000" }],
    };
    const res = await service.update("w1", "actor@x", "d1", dto);
    expect(res.format).toBe("story");
    expect(res.layers).toHaveLength(1);
    expect(rows[0]!.name).toBe("Keep"); // untouched
  });

  it("lists by workspace and returns a total", async () => {
    const { service } = makeService([baseRow({ id: "d1" }), baseRow({ id: "d2" }), baseRow({ id: "x", workspaceSlug: "w2" })]);
    const res = await service.list("w1");
    expect(res.total).toBe(2);
    expect(res.items.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("removes a design and records audit", async () => {
    const { service, rows, audit } = makeService([baseRow()]);
    await service.remove("w1", "actor@x", "d1");
    expect(rows).toHaveLength(0);
    expect(audit.record).toHaveBeenCalledWith("w1", "actor@x", "design.delete", "d1");
  });

  it("throws when updating/removing a missing design", async () => {
    const { service } = makeService([baseRow()]);
    await expect(service.update("w1", "a", "nope", { name: "X" })).rejects.toThrow(/no encontrado/);
    await expect(service.remove("w1", "a", "nope")).rejects.toThrow(/no encontrado/);
  });
});
