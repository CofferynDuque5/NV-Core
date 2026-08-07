import { describe, expect, it, vi } from "vitest";

import { slugify, WorkspaceRegistry } from "./workspace-registry.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuthStore } from "../auth/auth.store";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Mi Nueva Marca")).toBe("mi-nueva-marca");
  });

  it("strips accents/diacritics", () => {
    expect(slugify("Diseño Créativo")).toBe("diseno-creativo");
  });

  it("collapses non-alphanumerics and trims edges", () => {
    expect(slugify("  Hello, World!! ")).toBe("hello-world");
    expect(slugify("A & B / C")).toBe("a-b-c");
  });

  it("returns empty for input with no usable characters", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("WorkspaceRegistry.listForUser", () => {
  it("returns only the workspaces the user is a member of (no cross-tenant leak)", async () => {
    // Two tenants exist in the DB; user u1 only belongs to "acme".
    const dbRows: Record<string, { slug: string; name: string; kind: string; accent: string; tagline: string | null }> = {
      acme: { slug: "acme", name: "Acme", kind: "creative", accent: "#111", tagline: null },
      rival: { slug: "rival", name: "Rival", kind: "creative", accent: "#222", tagline: null },
    };
    const prisma = {
      enabled: true,
      workspace: {
        findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => dbRows[where.slug] ?? null),
      },
    };
    const store = {
      membershipsOf: vi.fn(async (userId: string) =>
        userId === "u1" ? [{ userId, workspaceSlug: "acme", role: "Owner" as const }] : [],
      ),
    };
    const registry = new WorkspaceRegistry(prisma as unknown as PrismaService, store as unknown as AuthStore);

    const list = await registry.listForUser("u1");
    expect(list.map((w) => w.slug)).toEqual(["acme"]);
    expect(list.map((w) => w.slug)).not.toContain("rival");
  });

  it("returns nothing for a user with no memberships", async () => {
    const prisma = { enabled: true, workspace: { findUnique: vi.fn(async () => null) } };
    const store = { membershipsOf: vi.fn(async () => []) };
    const registry = new WorkspaceRegistry(prisma as unknown as PrismaService, store as unknown as AuthStore);
    expect(await registry.listForUser("nobody")).toEqual([]);
  });
});
