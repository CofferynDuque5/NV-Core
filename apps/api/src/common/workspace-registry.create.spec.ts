import { describe, expect, it, vi } from "vitest";

import { WorkspaceRegistry } from "./workspace-registry.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuthStore } from "../auth/auth.store";

/** Fake Prisma with an in-memory Workspace table. */
function makePrisma() {
  const rows: { slug: string; name: string; kind: string; accent: string; tagline: string | null }[] = [];
  const prisma = {
    enabled: true,
    workspace: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        rows.find((r) => r.slug === where.slug) ?? null,
      ),
      findMany: vi.fn(async () => rows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          slug: String(data.slug),
          name: String(data.name),
          kind: String(data.kind),
          accent: String(data.accent),
          tagline: (data.tagline as string) ?? null,
        };
        rows.push(row);
        return row;
      }),
    },
  };
  return { prisma, rows };
}

describe("WorkspaceRegistry.create", () => {
  it("creates a DB workspace, maps it, and makes the creator Owner", async () => {
    const { prisma } = makePrisma();
    const store = { upsertMembership: vi.fn(async () => undefined) };
    const registry = new WorkspaceRegistry(
      prisma as unknown as PrismaService,
      store as unknown as AuthStore,
    );

    const ws = await registry.create(
      { name: "Mi Marca", kind: "ecommerce", accent: "#F00", tagline: "Tienda" },
      { userId: "u1", email: "u1@x.com" },
    );

    expect(ws.slug).toBe("mi-marca");
    expect(ws.initials).toBe("MM");
    expect(ws.enabledModules.length).toBeGreaterThan(0);
    expect(store.upsertMembership).toHaveBeenCalledWith("u1", "mi-marca", "Owner");
  });

  it("generates a unique slug when the base collides", async () => {
    const { prisma } = makePrisma();
    const store = { upsertMembership: vi.fn(async () => undefined) };
    const registry = new WorkspaceRegistry(
      prisma as unknown as PrismaService,
      store as unknown as AuthStore,
    );
    const a = await registry.create({ name: "Marca" }, { userId: "u", email: "u@x.com" });
    const b = await registry.create({ name: "Marca" }, { userId: "u", email: "u@x.com" });
    expect(a.slug).toBe("marca");
    expect(b.slug).toBe("marca-2");
  });

  it("does not collide with a built-in config slug", async () => {
    const { prisma } = makePrisma();
    const store = { upsertMembership: vi.fn(async () => undefined) };
    const registry = new WorkspaceRegistry(
      prisma as unknown as PrismaService,
      store as unknown as AuthStore,
    );
    // "fitness" is a built-in workspace slug → the DB one must differ.
    const ws = await registry.create({ name: "Fitness" }, { userId: "u", email: "u@x.com" });
    expect(ws.slug).toBe("fitness-2");
  });
});
