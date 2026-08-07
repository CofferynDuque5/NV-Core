import { describe, expect, it, vi } from "vitest";

import { FeedbackService, type CreateFeedbackDto } from "./feedback.module";
import type { PrismaService } from "../../prisma/prisma.service";

function makeService(enabled = true) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    enabled,
    feedback: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "f" + created.length, createdAt: new Date(0), ...data };
        created.push(row);
        return row;
      }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new FeedbackService(prisma as unknown as PrismaService, audit as never);
  return { service, created, audit, prisma };
}

const actor = { userId: "u1", email: "ana@x.com" };

describe("FeedbackService.submit", () => {
  it("persists feedback with the author and audits it", async () => {
    const { service, created, audit } = makeService();
    const dto: CreateFeedbackDto = { type: "idea", rating: 5, message: "  Me encanta  " };
    const fb = await service.submit("w1", actor, dto);
    expect(fb).toMatchObject({ type: "idea", rating: 5, message: "Me encanta", author: "ana@x.com" });
    expect(created[0]).toMatchObject({
      workspaceSlug: "w1",
      userId: "u1",
      author: "ana@x.com",
      type: "idea",
      rating: 5,
      message: "Me encanta",
    });
    expect(audit.record).toHaveBeenCalledWith("w1", "ana@x.com", "feedback.submit", "idea");
  });

  it("stores a null rating when none is given", async () => {
    const { service, created } = makeService();
    const fb = await service.submit("w1", actor, { type: "bug", message: "Algo falla" });
    expect(fb.rating).toBeUndefined();
    expect(created[0]!.rating).toBeNull();
  });

  it("throws when the DB is disabled", async () => {
    const { service } = makeService(false);
    await expect(
      service.submit("w1", actor, { type: "other", message: "hola" }),
    ).rejects.toThrow(/no configurada/);
  });
});
