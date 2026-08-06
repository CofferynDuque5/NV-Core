import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignRunner } from "./campaign-runner.service";

/**
 * Covers the campaign send loop — a money path that had no test. Two angles:
 * isDue() (the scheduling decision) and run() (delivery via ProviderManager,
 * per-target logging, and the final status transition).
 */

type AnyRec = Record<string, unknown>;

function makeRunner(overrides: {
  campaign?: AnyRec | null;
  send?: ReturnType<typeof vi.fn>;
  publish?: ReturnType<typeof vi.fn>;
} = {}) {
  const sendLogs: AnyRec[] = [];
  const updates: AnyRec[] = [];
  const emitted: { event: string; payload: unknown }[] = [];

  const prisma = {
    enabled: true,
    campaign: {
      findFirst: vi.fn(async () => overrides.campaign ?? null),
      update: vi.fn(async ({ data }: { data: AnyRec }) => {
        updates.push(data);
        return data;
      }),
      findMany: vi.fn(async () => []),
    },
    sendLog: {
      create: vi.fn(async ({ data }: { data: AnyRec }) => {
        sendLogs.push(data);
        return data;
      }),
    },
    groupVariable: { findMany: vi.fn(async () => []) },
  };

  const providers = {
    sendMessage: overrides.send ?? vi.fn(async () => ({ id: "wamid.1" })),
    sendMedia: vi.fn(async () => ({ id: "wamid.media" })),
    publish: overrides.publish ?? vi.fn(async () => ({ ok: true, id: "post.1", format: null })),
  };
  const jobs = { register: vi.fn(), dispatch: vi.fn() };
  const events = { emit: vi.fn((event: string, payload: unknown) => emitted.push({ event, payload })) };
  const audit = { record: vi.fn() };

  const runner = new CampaignRunner(
    {} as never,
    prisma as never,
    providers as never,
    jobs as never,
    events as never,
    audit as never,
  );
  return { runner, prisma, providers, jobs, events, audit, sendLogs, updates, emitted };
}

const campaign = (over: AnyRec = {}): AnyRec => ({
  id: "c1",
  name: "Promo",
  workspaceSlug: "w1",
  status: "programada",
  message: "Hola",
  channels: ["wa"],
  attachments: [],
  socialFormat: null,
  scheduleType: "once",
  scheduleAt: "",
  scheduleDays: [],
  lastRunDay: null,
  targets: [],
  ...over,
});

describe("CampaignRunner.isDue", () => {
  const { runner } = makeRunner();
  const isDue = (c: AnyRec, now: Date) =>
    (runner as unknown as { isDue: (c: AnyRec, n: Date) => boolean }).isDue(c, now);

  it("never runs paused or completed campaigns", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(isDue(campaign({ status: "pausada" }), now)).toBe(false);
    expect(isDue(campaign({ status: "completada" }), now)).toBe(false);
  });

  it("runs a one-off only once its scheduled instant has passed", () => {
    const c = campaign({ scheduleType: "once", status: "programada", scheduleAt: "2026-01-01T10:00:00.000Z" });
    expect(isDue(c, new Date("2026-01-01T09:59:00Z"))).toBe(false);
    expect(isDue(c, new Date("2026-01-01T10:01:00Z"))).toBe(true);
  });

  it("runs a daily campaign at the matching local time, once per day", () => {
    const at = new Date();
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    const c = campaign({ scheduleType: "daily", status: "activa", scheduleAt: `${hh}:${mm}` });
    expect(isDue(c, at)).toBe(true);
    // Already ran today → skip.
    const today = new Date().toISOString().slice(0, 10);
    expect(isDue({ ...c, lastRunDay: today }, at)).toBe(false);
  });

  it("runs a weekly campaign only on the configured weekday", () => {
    const at = new Date();
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    const base = campaign({ scheduleType: "weekly", status: "activa", scheduleAt: `${hh}:${mm}` });
    expect(isDue({ ...base, scheduleDays: [at.getDay()] }, at)).toBe(true);
    expect(isDue({ ...base, scheduleDays: [(at.getDay() + 1) % 7] }, at)).toBe(false);
  });
});

describe("CampaignRunner.run", () => {
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_GROUP_DELAY_MS;
  });

  it("delivers to every WhatsApp target and completes a one-off on full success", async () => {
    const c = campaign({
      targets: [
        { group: { id: "g1", name: "Grupo A", remoteJid: "1@g.us" } },
        { group: { id: "g2", name: "Grupo B", remoteJid: "2@g.us" } },
      ],
    });
    const { runner, providers, sendLogs, updates, emitted } = makeRunner({ campaign: c });

    await runner.run("w1", "c1");

    expect(providers.sendMessage).toHaveBeenCalledTimes(2);
    expect(sendLogs).toHaveLength(2);
    expect(sendLogs.every((l) => l.ok === true)).toBe(true);
    expect(updates[0]!.status).toBe("completada");
    expect(updates[0]!.progress).toBe(100);
    expect(emitted).toEqual([
      { event: "campaign.completed", payload: expect.objectContaining({ campaignId: "c1", ok: true }) },
    ]);
  });

  it("logs a failed send and re-arms the campaign as 'programada' (not completed)", async () => {
    const c = campaign({ targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }] });
    const send = vi.fn(async () => {
      throw new Error("proveedor caído");
    });
    const { runner, sendLogs, updates } = makeRunner({ campaign: c, send });

    await runner.run("w1", "c1");

    expect(sendLogs).toHaveLength(1);
    expect(sendLogs[0]!.ok).toBe(false);
    expect(sendLogs[0]!.error).toMatch(/caído/);
    expect(updates[0]!.status).toBe("programada"); // not completed → retriable
  });

  it("keeps a recurring campaign 'activa' after a run", async () => {
    const c = campaign({
      scheduleType: "daily",
      targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }],
    });
    const { runner, updates } = makeRunner({ campaign: c });
    await runner.run("w1", "c1");
    expect(updates[0]!.status).toBe("activa");
  });

  it("publishes to Facebook/Instagram when those channels are selected", async () => {
    const c = campaign({ channels: ["fb", "ig"], targets: [] });
    const publish = vi.fn(async () => ({ ok: true, id: "p1", format: null }));
    const { runner, sendLogs } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(publish).toHaveBeenCalledTimes(2);
    expect(sendLogs.map((l) => l.target).sort()).toEqual(["facebook", "instagram"]);
  });

  it("throws when the campaign does not belong to the workspace", async () => {
    const { runner } = makeRunner({ campaign: null });
    await expect(runner.run("w1", "missing")).rejects.toThrow(/no encontrada/);
  });
});
