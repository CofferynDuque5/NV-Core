import { describe, expect, it } from "vitest";

import { AnalyticsService } from "./analytics.module";
import type { PrismaService } from "../../prisma/prisma.service";

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

interface Seed {
  posts?: { workspaceSlug: string; createdAt: Date; channel: string; status?: string }[];
  contacts?: { workspaceSlug: string; createdAt: Date; stage: string }[];
  conversations?: { workspaceSlug: string; createdAt: Date }[];
  messages?: { workspaceSlug: string; createdAt: Date }[];
  campaigns?: { workspaceSlug: string; createdAt: Date; status?: string; posts?: number }[];
}

type Range = { gte?: Date; lt?: Date };
const inRange = (d: Date, r?: Range) => !r || ((!r.gte || d >= r.gte) && (!r.lt || d < r.lt));

function makeService(seed: Seed) {
  const s = {
    posts: seed.posts ?? [],
    contacts: seed.contacts ?? [],
    conversations: seed.conversations ?? [],
    messages: seed.messages ?? [],
    campaigns: seed.campaigns ?? [],
  };
  const match = (r: { workspaceSlug: string; createdAt: Date; status?: string }, where: Record<string, unknown>) =>
    r.workspaceSlug === where.workspaceSlug &&
    inRange(r.createdAt, where.createdAt as Range | undefined) &&
    (where.status ? r.status === where.status : true);

  const prisma = {
    enabled: true,
    post: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => s.posts.filter((r) => match(r, where)),
      count: async ({ where }: { where: Record<string, unknown> }) => s.posts.filter((r) => match(r, where)).length,
    },
    contact: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => s.contacts.filter((r) => match(r, where)),
      count: async ({ where }: { where: Record<string, unknown> }) => s.contacts.filter((r) => match(r, where)).length,
      groupBy: async ({ where }: { where: Record<string, unknown> }) => {
        const counts = new Map<string, number>();
        for (const r of s.contacts.filter((x) => match(x, where)))
          counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);
        return [...counts.entries()].map(([stage, _count]) => ({ stage, _count }));
      },
    },
    conversation: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => s.conversations.filter((r) => match(r, where)),
      count: async ({ where }: { where: Record<string, unknown> }) => s.conversations.filter((r) => match(r, where)).length,
    },
    message: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const ws = (where.conversation as { workspaceSlug: string }).workspaceSlug;
        return s.messages.filter((m) => m.workspaceSlug === ws && inRange(m.createdAt, where.createdAt as Range));
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        const ws = (where.conversation as { workspaceSlug: string }).workspaceSlug;
        return s.messages.filter((m) => m.workspaceSlug === ws && inRange(m.createdAt, where.createdAt as Range)).length;
      },
    },
    campaign: {
      count: async ({ where }: { where: Record<string, unknown> }) => s.campaigns.filter((r) => match(r, where)).length,
      findMany: async () => [],
    },
  };
  return new AnalyticsService(prisma as unknown as PrismaService);
}

describe("AnalyticsService.snapshot", () => {
  it("returns null without a database", async () => {
    const service = new AnalyticsService({ enabled: false } as unknown as PrismaService);
    expect(await service.snapshot("w1")).toBeNull();
  });

  it("computes period-over-period KPI deltas", async () => {
    const now = Date.now();
    const service = makeService({
      contacts: [
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), stage: "Lead" },
        { workspaceSlug: "w1", createdAt: new Date(now - 2 * DAY), stage: "Lead" },
        { workspaceSlug: "w1", createdAt: new Date(now - 3 * DAY), stage: "Cliente" },
        { workspaceSlug: "w1", createdAt: new Date(now - 40 * DAY), stage: "Lead" }, // previous window
      ],
    });
    const snap = (await service.snapshot("w1", 30))!;
    const kpi = snap.kpis.find((k) => k.label === "Contactos nuevos")!;
    expect(kpi.value).toBe("3"); // 3 in the current 30d window
    expect(kpi.delta).toBe("+200%"); // vs 1 in the previous window
    expect(kpi.deltaTrend).toBe("up");
    expect(snap.range?.days).toBe(30);
  });

  it("builds a continuous daily series bucketed by day", async () => {
    const now = Date.now();
    const d1 = new Date(now - 1 * DAY);
    const d5 = new Date(now - 5 * DAY);
    const service = makeService({
      posts: [
        { workspaceSlug: "w1", createdAt: d1, channel: "ig" },
        { workspaceSlug: "w1", createdAt: d1, channel: "ig" },
        { workspaceSlug: "w1", createdAt: d5, channel: "fb" },
      ],
    });
    const snap = (await service.snapshot("w1", 30))!;
    expect(snap.series).toHaveLength(30); // one bucket per day, continuous
    expect(snap.series!.reduce((a, p) => a + p.posts, 0)).toBe(3);
    expect(snap.series!.find((p) => p.date === dayKey(d1))!.posts).toBe(2);
    expect(snap.series!.find((p) => p.date === dayKey(d5))!.posts).toBe(1);
  });

  it("derives channel share within the window", async () => {
    const now = Date.now();
    const service = makeService({
      posts: [
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), channel: "ig" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), channel: "ig" },
        { workspaceSlug: "w1", createdAt: new Date(now - 2 * DAY), channel: "fb" },
      ],
    });
    const snap = (await service.snapshot("w1", 30))!;
    expect(snap.platforms[0]).toMatchObject({ channel: "ig", count: 2, pct: "67%" });
    expect(snap.platforms[1]).toMatchObject({ channel: "fb", count: 1, pct: "33%" });
  });

  it("orders the funnel by canonical stage and drops empty stages", async () => {
    const now = Date.now();
    const c = (stage: string) => ({ workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), stage });
    const service = makeService({ contacts: [c("Cliente"), c("Lead"), c("Lead"), c("Inactivo")] });
    const snap = (await service.snapshot("w1", 30))!;
    expect(snap.funnel.map((f) => f.label)).toEqual(["Lead", "Cliente", "Inactivo"]); // canonical order, "En riesgo" absent
    expect(snap.funnel.find((f) => f.label === "Lead")!.value).toBe("2");
  });

  it("computes conversion rates from real data", async () => {
    const now = Date.now();
    const service = makeService({
      contacts: [
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), stage: "Cliente" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), stage: "Lead" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), stage: "Lead" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), stage: "Lead" },
      ],
      posts: [
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), channel: "ig", status: "sent" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), channel: "ig", status: "sent" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), channel: "fb", status: "draft" },
        { workspaceSlug: "w1", createdAt: new Date(now - 1 * DAY), channel: "fb", status: "draft" },
      ],
    });
    const snap = (await service.snapshot("w1", 30))!;
    expect(snap.conversion!.find((r) => r.label === "Conversión (Cliente)")!.value).toBe("25%");
    expect(snap.conversion!.find((r) => r.label === "Entrega de posts")!.value).toBe("50%");
  });

  it("places messages on the weekday×hour heatmap (UTC)", async () => {
    const now = Date.now();
    const d = new Date(now - 1 * DAY);
    const service = makeService({
      messages: [
        { workspaceSlug: "w1", createdAt: d },
        { workspaceSlug: "w1", createdAt: d },
      ],
    });
    const snap = (await service.snapshot("w1", 30))!;
    expect(snap.heatmap).toHaveLength(7);
    expect(snap.heatmap[0]).toHaveLength(24);
    expect(snap.heatmap[d.getUTCDay()]![d.getUTCHours()]).toBe(2);
    const total = snap.heatmap.flat().reduce((a, n) => a + n, 0);
    expect(total).toBe(2);
    expect(snap.kpis.find((k) => k.label === "Mensajes")!.value).toBe("2");
  });
});
