import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { WorkspaceRegistry } from "../../common/workspace-registry.service";
import { WorkspacesService } from "./workspaces.module";
import { ProductsService } from "../products/products.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Marcas y Tienda contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const store = { membershipsOf: async () => [], upsertMembership: async () => undefined };
  const registry = new WorkspaceRegistry(prisma as never, store as never);
  const mediaDir = join(tmpdir(), `nv-media-${Date.now()}`);
  const config = { get: (k: string) => (k === "media" ? { dir: mediaDir } : k === "superAdmins" ? [] : undefined) };
  const audit = { record: async () => undefined };
  const svc = new WorkspacesService(registry, {} as never, config as never, prisma as never, audit as never);
  const products = new ProductsService(prisma as never, audit as never);

  it("edita nombre, color y objetivos; elimina la marca con todos sus datos y archivos", async () => {
    const slug = `marca-it-${Date.now()}`;
    const other = `${slug}-otra`;
    await prisma.workspace.create({ data: { slug, name: "Marca IT", createdBy: "a@b.c" } });
    await prisma.workspace.create({ data: { slug: other, name: "Otra", createdBy: "a@b.c" } });

    const edited = await svc.update(slug, { name: "Marca Nueva", accent: "#8C7BEF", goals: ["ventas", "difusion", "ventas", "x"] }, "a@b.c");
    expect(edited.name).toBe("Marca Nueva");
    expect(edited.accent).toBe("#8C7BEF");
    expect(edited.goals).toEqual(["ventas", "difusion"]);

    // Data across tables, including rows linked by foreign keys.
    const contact = await prisma.contact.create({ data: { workspaceSlug: slug, name: "Cliente" } });
    await prisma.contactNote.create({ data: { workspaceSlug: slug, contactId: contact.id, body: "nota", author: "a" } });
    const group = await prisma.group.create({ data: { workspaceSlug: slug, name: "Ventas" } });
    const camp = await prisma.campaign.create({ data: { workspaceSlug: slug, name: "Promo" } });
    await prisma.campaignTarget.create({ data: { campaignId: camp.id, groupId: group.id } });
    await products.create(slug, "a@b.c", { name: "Combo", prices: { VES: "350", XXX: "1" } });
    await prisma.membership.create({ data: { workspaceSlug: slug, user: { create: { email: `${slug}@x.y`, name: "U", passwordHash: "x" } } } });
    await prisma.contact.create({ data: { workspaceSlug: other, name: "No tocar" } });
    await mkdir(join(mediaDir, slug), { recursive: true });
    await writeFile(join(mediaDir, slug, "a.png"), "x");

    expect((await products.list(slug))[0]!.prices).toEqual({ VES: "350" });

    await expect(svc.remove(slug, "Marca IT", "a@b.c")).rejects.toThrow(/nombre exacto/);
    await svc.remove(slug, "Marca Nueva", "a@b.c");

    expect(await prisma.workspace.findUnique({ where: { slug } })).toBeNull();
    expect(await prisma.contact.count({ where: { workspaceSlug: slug } })).toBe(0);
    expect(await prisma.campaign.count({ where: { workspaceSlug: slug } })).toBe(0);
    expect(await prisma.product.count({ where: { workspaceSlug: slug } })).toBe(0);
    expect(await prisma.membership.count({ where: { workspaceSlug: slug } })).toBe(0);
    expect(await prisma.workspaceSettings.count({ where: { workspaceSlug: slug } })).toBe(0);
    await expect(stat(join(mediaDir, slug))).rejects.toThrow();
    // Another brand is untouched.
    expect(await prisma.contact.count({ where: { workspaceSlug: other } })).toBe(1);
  });

  it("no deja renombrar ni eliminar una marca de demostración", async () => {
    await expect(svc.update("ciclo-creativo", { name: "X" }, "a@b.c")).rejects.toThrow(/demostración/);
    await expect(svc.remove("ciclo-creativo", "Ciclo Creativo", "a@b.c")).rejects.toThrow(/demostración/);
    const withGoals = await svc.update("ciclo-creativo", { goals: ["redes"] }, "a@b.c");
    expect(withGoals.goals).toEqual(["redes"]);
  });
});
