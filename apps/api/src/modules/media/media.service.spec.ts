import { describe, expect, it, vi } from "vitest";

import { MediaService } from "./media.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Asset {
  id: string;
  workspaceSlug: string;
  type: string;
  title: string;
  tag: string | null;
  folderId: string | null;
  url: string | null;
}

function makeService(seed: Asset[] = [], folderIds: string[] = ["f1"]) {
  const rows = [...seed];
  const prisma = {
    enabled: true,
    mediaFolder: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
        folderIds.includes(where.id) && where.workspaceSlug === "w1" ? { id: where.id } : null,
      ),
    },
    mediaAsset: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => r.id === where.id && r.workspaceSlug === where.workspaceSlug) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async ({ where, distinct }: { where: Record<string, unknown>; distinct?: string[] }) => {
        let out = rows.filter((r) => r.workspaceSlug === where.workspaceSlug);
        if (where.tag && (where.tag as { not?: null }).not === null) out = out.filter((r) => r.tag);
        if (distinct?.includes("tag")) {
          const seen = new Set<string>();
          out = out.filter((r) => (r.tag && !seen.has(r.tag) ? (seen.add(r.tag), true) : false));
          return out.map((r) => ({ tag: r.tag }));
        }
        return out;
      }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new MediaService(prisma as unknown as PrismaService, audit as never, {} as never);
  return { service, rows };
}

function baseAsset(over: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    workspaceSlug: "w1",
    type: "image",
    title: "Foto",
    tag: "producto",
    folderId: null,
    url: "https://x/y.jpg",
    ...over,
  };
}

describe("MediaService.updateAsset", () => {
  it("renames, retags and moves", async () => {
    const { service } = makeService([baseAsset()]);
    const res = await service.updateAsset("w1", "actor@x", "a1", {
      title: "Nuevo",
      tag: "campaña",
      folderId: "f1",
    });
    expect(res.title).toBe("Nuevo");
    expect(res.tag).toBe("campaña");
    expect(res.folderId).toBe("f1");
  });

  it("clears the tag with an empty string", async () => {
    const { service, rows } = makeService([baseAsset()]);
    await service.updateAsset("w1", "actor@x", "a1", { tag: "" });
    expect(rows[0]!.tag).toBeNull();
  });

  it("throws when the asset does not exist", async () => {
    const { service } = makeService([]);
    await expect(service.updateAsset("w1", "actor@x", "nope", { title: "x" })).rejects.toThrow(/no encontrado/);
  });

  it("rejects moving into a folder that isn't in this workspace", async () => {
    const { service } = makeService([baseAsset()], ["f1"]); // only f1 is owned
    await expect(
      service.updateAsset("w1", "actor@x", "a1", { folderId: "foreign-folder" }),
    ).rejects.toThrow(/Carpeta no encontrada/);
  });
});

describe("MediaService.createAsset (folder ownership)", () => {
  it("rejects a foreign folderId", async () => {
    const { service } = makeService([], ["f1"]);
    await expect(
      service.createAsset("w1", "actor@x", { type: "image", title: "X", folderId: "foreign" }),
    ).rejects.toThrow(/Carpeta no encontrada/);
  });
});

describe("MediaService.tags", () => {
  it("returns distinct non-empty tags", async () => {
    const { service } = makeService([
      baseAsset({ id: "a1", tag: "producto" }),
      baseAsset({ id: "a2", tag: "producto" }),
      baseAsset({ id: "a3", tag: "evento" }),
      baseAsset({ id: "a4", tag: null }),
    ]);
    const tags = await service.tags("w1");
    expect(tags.sort()).toEqual(["evento", "producto"]);
  });
});
