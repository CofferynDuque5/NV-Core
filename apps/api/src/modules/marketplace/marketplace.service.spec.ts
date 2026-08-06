import { describe, expect, it, vi } from "vitest";

import { MarketplaceService } from "./marketplace.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Install {
  workspaceSlug: string;
  appId: string;
  createdAt: Date;
}

function makeService(seed: Install[] = []) {
  const rows = [...seed];
  const prisma = {
    enabled: true,
    appInstallation: {
      findMany: vi.fn(async ({ where }: { where: { workspaceSlug: string } }) =>
        rows.filter((r) => r.workspaceSlug === where.workspaceSlug),
      ),
      upsert: vi.fn(async ({ where }: { where: { workspaceSlug_appId: { workspaceSlug: string; appId: string } } }) => {
        const key = where.workspaceSlug_appId;
        let row = rows.find((r) => r.workspaceSlug === key.workspaceSlug && r.appId === key.appId);
        if (!row) {
          row = { workspaceSlug: key.workspaceSlug, appId: key.appId, createdAt: new Date(0) };
          rows.push(row);
        }
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { workspaceSlug: string; appId: string } }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]!.workspaceSlug === where.workspaceSlug && rows[i]!.appId === where.appId) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new MarketplaceService(prisma as unknown as PrismaService, audit as never);
  return { service, rows };
}

describe("MarketplaceService", () => {
  it("returns the full catalog with install state merged", async () => {
    const { service } = makeService([{ workspaceSlug: "w1", appId: "surveys", createdAt: new Date(0) }]);
    const catalog = await service.catalog("w1");
    expect(catalog.length).toBeGreaterThanOrEqual(10);
    const surveys = catalog.find((a) => a.id === "surveys")!;
    expect(surveys.installed).toBe(true);
    expect(surveys.installedAt).toBeDefined();
    const other = catalog.find((a) => a.id === "chatbot")!;
    expect(other.installed).toBe(false);
  });

  it("installs a catalog app (idempotent)", async () => {
    const { service, rows } = makeService();
    const entry = await service.install("w1", "actor@x", "chatbot");
    expect(entry.installed).toBe(true);
    expect(entry.id).toBe("chatbot");
    await service.install("w1", "actor@x", "chatbot"); // again → no duplicate
    expect(rows.filter((r) => r.appId === "chatbot")).toHaveLength(1);
  });

  it("rejects installing an unknown app", async () => {
    const { service } = makeService();
    await expect(service.install("w1", "actor@x", "nope")).rejects.toThrow(/no encontrada/);
  });

  it("uninstalls an app", async () => {
    const { service, rows } = makeService([{ workspaceSlug: "w1", appId: "surveys", createdAt: new Date(0) }]);
    await service.uninstall("w1", "actor@x", "surveys");
    expect(rows).toHaveLength(0);
    const catalog = await service.catalog("w1");
    expect(catalog.find((a) => a.id === "surveys")!.installed).toBe(false);
  });
});
