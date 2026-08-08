import { HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CampaignsService } from "./campaigns.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Camp {
  id: string;
  workspaceSlug: string;
  name: string;
  status: string;
  channels: string[];
  message: string;
  scheduleType: string;
  scheduleAt: string | null;
  scheduleDays: number[];
  targets: { groupId: string }[];
}

/** Fake Prisma with groups + campaigns for import/export. */
function makeService(opts: {
  groups?: { id: string; name: string }[];
  campaigns?: Partial<Camp>[];
  assertWithinLimit?: (ws: string, resource: string, count: number) => Promise<void>;
} = {}) {
  const groups = opts.groups ?? [];
  const campaigns: Camp[] = (opts.campaigns ?? []).map((c, i) => ({
    id: c.id ?? "c" + i,
    workspaceSlug: "w1",
    name: c.name ?? "C" + i,
    status: c.status ?? "borrador",
    channels: c.channels ?? [],
    message: c.message ?? "",
    scheduleType: c.scheduleType ?? "once",
    scheduleAt: c.scheduleAt ?? null,
    scheduleDays: c.scheduleDays ?? [],
    targets: c.targets ?? [],
  }));
  const targetLinks: { campaignId: string; groupId: string }[] = [];
  const prisma = {
    enabled: true,
    group: {
      findMany: vi.fn(async () => groups.map((g) => ({ id: g.id, name: g.name }))),
    },
    campaign: {
      findMany: vi.fn(async (args: { select?: unknown; cursor?: { id: string }; take?: number }) => {
        if (args.select) return campaigns.map((c) => ({ name: c.name }));
        let list = [...campaigns].sort((a, b) => (a.id < b.id ? -1 : 1));
        if (args.cursor) list = list.filter((c) => c.id > args.cursor!.id);
        return list.slice(0, args.take ?? list.length);
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Camp = {
          id: "n" + campaigns.length,
          workspaceSlug: "w1",
          name: String(data.name),
          status: String(data.status),
          channels: (data.channels as string[]) ?? [],
          message: String(data.message ?? ""),
          scheduleType: String(data.scheduleType ?? "once"),
          scheduleAt: (data.scheduleAt as string | null) ?? null,
          scheduleDays: (data.scheduleDays as number[]) ?? [],
          targets: [],
        };
        campaigns.push(row);
        return row;
      }),
    },
    campaignTarget: {
      createMany: vi.fn(async ({ data }: { data: { campaignId: string; groupId: string }[] }) => {
        targetLinks.push(...data);
        return { count: data.length };
      }),
    },
  };
  const audit = { record: vi.fn() };
  const plans = {
    assertWithinLimit: vi.fn(opts.assertWithinLimit ?? (async () => undefined)),
  };
  const service = new CampaignsService(
    prisma as unknown as PrismaService,
    audit as never,
    plans as never,
  );
  return { service, campaigns, targetLinks };
}

describe("CampaignsService.exportCsv", () => {
  it("exports campaigns with recipient group names", async () => {
    const { service } = makeService({
      groups: [
        { id: "g1", name: "VIP" },
        { id: "g2", name: "Clientes" },
      ],
      campaigns: [
        {
          name: "Promo",
          status: "activa",
          channels: ["wa", "ig"],
          message: "Hola",
          scheduleType: "weekly",
          scheduleDays: [1, 5],
          targets: [{ groupId: "g1" }, { groupId: "g2" }],
        },
      ],
    });
    const csv = await service.exportCsv("w1");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,status,channels,message,scheduleType,scheduleAt,scheduleDays,targets");
    expect(lines[1]).toBe("Promo,activa,wa;ig,Hola,weekly,,1;5,VIP;Clientes");
  });
});

describe("CampaignsService.importCsv", () => {
  it("creates campaigns as drafts, resolves recipient groups, dedupes by name", async () => {
    const { service, campaigns, targetLinks } = makeService({
      groups: [
        { id: "g1", name: "VIP" },
        { id: "g2", name: "Clientes" },
      ],
      campaigns: [{ name: "Existente" }],
    });
    const csv =
      "name,status,channels,scheduleType,scheduleDays,targets\n" +
      "Nueva,activa,wa;ig,weekly,1;5,VIP;Clientes\n" + // created (status forced to borrador)
      "Existente,activa,wa,once,,VIP\n" + // duplicate name → skipped
      "SinNombre,,wa,once,,VIP".replace("SinNombre", ""); // missing name → error
    const res = await service.importCsv("w1", "actor", csv);
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(1); // missing name
    const nueva = campaigns.find((c) => c.name === "Nueva")!;
    expect(nueva.status).toBe("borrador"); // never auto-launch
    expect(nueva.channels).toEqual(["wa", "ig"]);
    expect(nueva.scheduleDays).toEqual([1, 5]);
    expect(targetLinks.filter((t) => t.campaignId === nueva.id)).toHaveLength(2);
  });

  it("reports recipient groups that don't exist but still creates the campaign", async () => {
    const { service, campaigns, targetLinks } = makeService({ groups: [{ id: "g1", name: "VIP" }] });
    const res = await service.importCsv("w1", "actor", "name,targets\nX,VIP;Fantasma");
    expect(res.created).toBe(1);
    expect(res.errors[0]).toMatch(/Fantasma/);
    const x = campaigns.find((c) => c.name === "X")!;
    expect(targetLinks.filter((t) => t.campaignId === x.id)).toHaveLength(1); // only VIP linked
  });

  it("drops invalid channels and defaults schedule to once", async () => {
    const { service, campaigns } = makeService();
    await service.importCsv("w1", "actor", "name,channels,scheduleType\nY,wa;zz,bogus");
    const y = campaigns.find((c) => c.name === "Y")!;
    expect(y.channels).toEqual(["wa"]);
    expect(y.scheduleType).toBe("once");
  });

  it("enforces the plan limit with the count of NEW campaigns (dupes excluded)", async () => {
    const assertWithinLimit = vi.fn(async () => undefined);
    const { service } = makeService({
      campaigns: [{ name: "Existente" }], // duplicate → must not count toward the limit
      assertWithinLimit,
    });
    // 2 new + 1 duplicate → the gate should be asked to fit exactly 2.
    await service.importCsv("w1", "actor", "name\nUna\nExistente\nDos");
    expect(assertWithinLimit).toHaveBeenCalledWith("w1", "campaigns", 2);
  });

  it("rejects the whole import (402) before writing when it would overflow the plan", async () => {
    const { service, campaigns } = makeService({
      assertWithinLimit: async () => {
        throw new HttpException("Límite alcanzado", HttpStatus.PAYMENT_REQUIRED);
      },
    });
    const before = campaigns.length;
    await expect(service.importCsv("w1", "actor", "name\nUna\nDos\nTres")).rejects.toBeInstanceOf(
      HttpException,
    );
    // Nothing was created — the gate runs before any write.
    expect(campaigns).toHaveLength(before);
  });
});
