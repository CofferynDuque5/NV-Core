import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FunnelsService } from "./funnels.module";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditLogger } from "../../common/audit-logger.service";

function makeService(funnel: Record<string, unknown> | null) {
  let saved: unknown = null;
  const prisma = {
    enabled: true,
    funnel: {
      findUnique: vi.fn(async () => funnel),
      update: vi.fn(async ({ data }: { data: unknown }) => {
        saved = data;
        return funnel;
      }),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new FunnelsService(prisma as unknown as PrismaService, audit as unknown as AuditLogger);
  return { svc, getSaved: () => saved };
}

const funnel = {
  id: "fn1",
  workspaceSlug: "w1",
  steps: [
    { id: "s1", name: "Opt-in", type: "optin", formId: "f1", views: 0 },
    { id: "s2", name: "Gracias", type: "thankyou", headline: "¡Listo!", views: 0 },
  ],
};

describe("FunnelsService.getPublicStep", () => {
  it("returns the step, counts a view, and points to the next index", async () => {
    const { svc, getSaved } = makeService(structuredClone(funnel));
    const step = await svc.getPublicStep("fn1", 0);
    expect(step).toMatchObject({ index: 0, total: 2, type: "optin", formId: "f1", nextIndex: 1 });
    // view was incremented + persisted
    expect((getSaved() as { steps: { views: number }[] }).steps[0]!.views).toBe(1);
  });

  it("nextIndex is null on the last step", async () => {
    const { svc } = makeService(structuredClone(funnel));
    const step = await svc.getPublicStep("fn1", 1);
    expect(step.nextIndex).toBeNull();
    expect(step.type).toBe("thankyou");
  });

  it("throws for an out-of-range step or missing funnel", async () => {
    const { svc } = makeService(structuredClone(funnel));
    await expect(svc.getPublicStep("fn1", 5)).rejects.toBeInstanceOf(NotFoundException);
    const missing = makeService(null);
    await expect(missing.svc.getPublicStep("nope", 0)).rejects.toBeInstanceOf(NotFoundException);
  });
});
