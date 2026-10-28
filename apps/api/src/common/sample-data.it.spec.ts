import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { SampleDataService } from "./sample-data.service";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("SampleDataService contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const svc = new SampleDataService(prisma as never);

  it("detecta y quita solo los datos de ejemplo; lo del usuario se queda", async () => {
    const ws = `sample-${Date.now()}`;
    await svc.seed(ws);
    // Same name as an example contact, but a real address: must survive.
    await prisma.contact.create({ data: { workspaceSlug: ws, name: "Ana Torres", email: "ana@cliente-real.com" } });
    await prisma.automation.create({ data: { workspaceSlug: ws, name: "Mi flujo", status: "pausado" } });
    // A segment with an example name, created by the user much later: kept.
    await prisma.segment.create({
      data: { workspaceSlug: ws, name: "Clientes activos", createdAt: new Date(Date.now() + 86_400_000) },
    });

    const before = await svc.summary(ws);
    expect(before.present).toBe(true);
    expect(before.counts.contacts).toBe(10);
    expect(before.counts.automations).toBe(3);

    const after = await svc.remove(ws);
    expect(after.present).toBe(false);
    expect(await prisma.contact.findMany({ where: { workspaceSlug: ws }, select: { email: true } })).toEqual([
      { email: "ana@cliente-real.com" },
    ]);
    expect((await prisma.automation.findMany({ where: { workspaceSlug: ws } })).map((a) => a.name)).toEqual(["Mi flujo"]);
    expect(await prisma.segment.count({ where: { workspaceSlug: ws } })).toBe(1);
    // Another brand's example data is untouched.
    expect((await svc.summary(`${ws}-otra`)).present).toBe(false);
  });
});
