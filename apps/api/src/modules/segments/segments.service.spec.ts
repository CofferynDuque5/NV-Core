import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SegmentsService, type PreviewSegmentDto } from "./segments.module";
import type { PrismaService } from "../../prisma/prisma.service";

function makeService(opts: { contactCount?: number; sample?: unknown[]; segments?: unknown[] } = {}) {
  const prisma = {
    enabled: true,
    contact: {
      count: vi.fn(async () => opts.contactCount ?? 0),
      findMany: vi.fn(async () => opts.sample ?? []),
    },
    segment: {
      findMany: vi.fn(async () => opts.segments ?? []),
      count: vi.fn(async () => (opts.segments ?? []).length),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new SegmentsService(prisma as unknown as PrismaService, audit as never);
  return { service, prisma };
}

describe("SegmentsService.preview", () => {
  it("rejects invalid rules with 400 before touching the DB", async () => {
    const { service, prisma } = makeService();
    const dto = { match: "all", rules: [{ field: "name", operator: "has_tag", value: "x" }] } as unknown as PreviewSegmentDto;
    await expect(service.preview("w1", dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.contact.count).not.toHaveBeenCalled();
  });

  it("returns the live count + mapped sample for valid rules", async () => {
    const { service, prisma } = makeService({
      contactCount: 7,
      sample: [
        {
          id: "c1",
          name: "Ana",
          phone: null,
          email: "ana@x.com",
          company: null,
          tags: ["vip"],
          stage: "Cliente",
          lastContactAt: null,
          createdAt: new Date(),
        },
      ],
    });
    const dto = { match: "all", rules: [{ field: "stage", operator: "equals", value: "Cliente" }] } as unknown as PreviewSegmentDto;
    const res = await service.preview("w1", dto);
    expect(res.count).toBe(7);
    expect(res.sample).toHaveLength(1);
    expect(res.sample[0]!.name).toBe("Ana");
    // scoped to the workspace
    expect(prisma.contact.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ workspaceSlug: "w1" }),
    });
  });
});

describe("SegmentsService.list", () => {
  it("computes a live audience count per segment", async () => {
    const { service, prisma } = makeService({
      segments: [
        { id: "s1", name: "VIP", color: "#fff", match: "all", rules: [{ field: "tags", operator: "has_tag", value: "vip" }], createdAt: new Date() },
      ],
      contactCount: 3,
    });
    const res = await service.list("w1");
    expect(res.items[0]!.count).toBe(3);
    expect(res.items[0]!.match).toBe("all");
    expect(prisma.contact.count).toHaveBeenCalledTimes(1);
  });
});
