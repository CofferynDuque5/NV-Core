import { describe, expect, it, vi } from "vitest";

import { PostsService } from "./posts.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Row {
  id: string;
  workspaceSlug: string;
  channel: string;
  title: string;
  copy: string | null;
  hashtags: string[];
  status: string;
  scheduledAt: Date | null;
  campaignId: string | null;
  campaign: { name: string } | null;
}

function makeService(seed: Row[] = []) {
  const rows = [...seed];
  let seq = 0;
  const prisma = {
    enabled: true,
    post: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => r.id === where.id && r.workspaceSlug === where.workspaceSlug) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = {
          id: `p${++seq}`,
          workspaceSlug: String(data.workspaceSlug),
          channel: String(data.channel),
          title: String(data.title),
          copy: (data.copy as string) ?? null,
          hashtags: (data.hashtags as string[]) ?? [],
          status: String(data.status),
          scheduledAt: (data.scheduledAt as Date) ?? null,
          campaignId: (data.campaignId as string) ?? null,
          campaign: null,
        };
        rows.push(row);
        return row;
      }),
    },
  };
  const audit = { record: vi.fn() };
  const scheduler = { schedule: vi.fn(), cancel: vi.fn() };
  const service = new PostsService(
    prisma as unknown as PrismaService,
    audit as never,
    scheduler as never,
  );
  return { service, scheduler, rows };
}

function baseRow(over: Partial<Row> = {}): Row {
  return {
    id: "p1",
    workspaceSlug: "w1",
    channel: "wa",
    title: "Post",
    copy: "hola",
    hashtags: ["a"],
    status: "scheduled",
    scheduledAt: new Date("2026-09-01T10:00:00Z"),
    campaignId: null,
    campaign: null,
    ...over,
  };
}

describe("PostsService.update (move / reschedule)", () => {
  it("re-programs the job when the schedule changes", async () => {
    const { service, scheduler } = makeService([baseRow()]);
    const newDate = "2026-09-02T15:00:00Z";
    const res = await service.update("w1", "actor@x", "p1", { scheduledAt: newDate });
    expect(res.scheduledAt).toBe(new Date(newDate).toISOString());
    expect(scheduler.cancel).toHaveBeenCalledWith("p1");
    expect(scheduler.schedule).toHaveBeenCalledWith("p1", new Date(newDate));
  });

  it("cancels the job when unscheduled (scheduledAt null)", async () => {
    const { service, scheduler } = makeService([baseRow()]);
    await service.update("w1", "actor@x", "p1", { scheduledAt: null, status: "draft" });
    expect(scheduler.cancel).toHaveBeenCalledWith("p1");
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("refuses to modify a sent post", async () => {
    const { service } = makeService([baseRow({ status: "sent" })]);
    await expect(service.update("w1", "actor@x", "p1", { title: "x" })).rejects.toThrow(/enviada/);
  });

  it("throws when the post does not exist", async () => {
    const { service } = makeService([]);
    await expect(service.update("w1", "actor@x", "nope", {})).rejects.toThrow(/no encontrada/);
  });
});

describe("PostsService.duplicate", () => {
  it("copies the post and schedules the copy on the new date", async () => {
    const { service, scheduler, rows } = makeService([baseRow()]);
    const copy = await service.duplicate("w1", "actor@x", "p1", { scheduledAt: "2026-09-05T09:00:00Z" });
    expect(copy.title).toBe("Post (copia)");
    expect(copy.status).toBe("scheduled");
    expect(rows).toHaveLength(2);
    expect(scheduler.schedule).toHaveBeenCalledWith(copy.id, new Date("2026-09-05T09:00:00Z"));
  });

  it("copies a sent post as a draft (no schedule) when no date given", async () => {
    const { service, scheduler } = makeService([baseRow({ status: "sent", scheduledAt: null })]);
    const copy = await service.duplicate("w1", "actor@x", "p1", {});
    expect(copy.status).toBe("draft");
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });
});
