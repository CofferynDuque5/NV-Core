import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { SampleDataService } from "../../common/sample-data.service";
import { DemoService } from "./demo.module";
import { DEMO_SLUG } from "./demo-slug";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Demo pública contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const config = {
    get: () => ({ enabled: true, email: "demo@demo.nvmarketing.invalid", slug: DEMO_SLUG }),
  };
  const svc = new DemoService(
    prisma as never,
    config as never,
    new SampleDataService(prisma as never),
  );

  it("llena la demo con chats, campañas, cobros y productos, y la rehace igual al reiniciar", async () => {
    expect(await svc.ensure()).toBe(true);
    expect(await svc.ensure()).toBe(true); // second start: rebuilt, not duplicated
    const where = { workspaceSlug: DEMO_SLUG };
    expect(await prisma.contact.count({ where })).toBe(24);
    expect(await prisma.conversation.count({ where })).toBe(8);
    expect(await prisma.campaign.count({ where })).toBe(4);
    expect(await prisma.group.count({ where })).toBe(12);
    expect(await prisma.paymentRequest.count({ where })).toBe(5);
    expect(await prisma.product.count({ where })).toBe(6);
    expect(await prisma.sendLog.count({ where })).toBeGreaterThan(0);
    expect(await prisma.segment.count({ where })).toBeGreaterThan(0);

    // Generic names only: no third-party brands in the demo.
    const names = [
      ...(await prisma.product.findMany({ where, select: { name: true } })).map((p) => p.name),
      ...(await prisma.campaign.findMany({ where, select: { name: true, message: true } })).flatMap(
        (c) => [c.name, c.message],
      ),
    ].join(" ");
    expect(names).not.toMatch(/netflix|spotify|disney|youtube|hbo/i);

    // Only the read-only visitor belongs to it.
    const members = await prisma.membership.findMany({
      where: { workspaceSlug: DEMO_SLUG },
      select: { role: true },
    });
    expect(members).toEqual([{ role: "Visor" }]);
  });
});
