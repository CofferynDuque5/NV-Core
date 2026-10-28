import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignRunner, UNCONFIRMED, slotRunKey } from "./campaign-runner.service";

/**
 * Covers the campaign send loop — a money path that had no test. Two angles:
 * isDue() (the scheduling decision) and run() (delivery via ProviderManager,
 * per-target logging, and the final status transition).
 */

type AnyRec = Record<string, unknown>;

function makeRunner(
  overrides: {
    campaign?: AnyRec | null;
    send?: ReturnType<typeof vi.fn>;
    publish?: ReturnType<typeof vi.fn>;
  } = {},
) {
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
      findMany: vi.fn(async (): Promise<AnyRec[]> => []),
      // Reserva atómica del turno (seguro de envío único): por defecto la gana.
      updateMany: vi.fn(async () => ({ count: 1 })),
      // Relectura del estado antes de cada envío («Pausar» detiene de verdad).
      findUnique: vi.fn(async () => ({ status: overrides.campaign?.status ?? "programada" })),
    },
    sendLog: {
      // La fila se crea como marca "en curso" y luego se actualiza con el resultado.
      // Igual que el índice único (campaignId, groupId, runKey) de la base de datos.
      create: vi.fn(async ({ data }: { data: AnyRec }) => {
        const clash = sendLogs.some(
          (l) =>
            data.groupId != null &&
            data.runKey != null &&
            l.campaignId === data.campaignId &&
            l.groupId === data.groupId &&
            l.runKey === data.runKey,
        );
        if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        const row = { id: `log-${sendLogs.length + 1}`, ...data };
        sendLogs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: AnyRec }) => {
        const row = sendLogs.find((l) => l.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      // Anti-duplicado: por defecto, ningún envío previo (no hay duplicados).
      findFirst: vi.fn(async (): Promise<AnyRec | null> => null),
      updateMany: vi.fn(async ({ where, data }: { where: AnyRec; data: AnyRec }) => {
        const rows = sendLogs.filter(
          (l) =>
            (where.campaignId === undefined || l.campaignId === where.campaignId) &&
            (where.runKey === undefined || l.runKey === where.runKey) &&
            (where.error === undefined || l.error === where.error),
        );
        rows.forEach((l) => Object.assign(l, data));
        return { count: rows.length };
      }),
      count: vi.fn(
        async ({ where }: { where: AnyRec }) =>
          sendLogs.filter((l) => l.runKey === where.runKey && l.ok === where.ok).length,
      ),
    },
    groupVariable: { findMany: vi.fn(async () => []) },
    post: { create: vi.fn(async ({ data }: { data: AnyRec }) => ({ id: "post-row", ...data })) },
  };

  const providers = {
    sendMessage: overrides.send ?? vi.fn(async () => ({ id: "wamid.1" })),
    sendMedia: vi.fn(async () => ({ id: "wamid.media" })),
    publish: overrides.publish ?? vi.fn(async () => ({ ok: true, id: "post.1", format: null })),
  };
  const jobs = { register: vi.fn(), dispatch: vi.fn() };
  const events = {
    emit: vi.fn((event: string, payload: unknown) => emitted.push({ event, payload })),
  };
  const audit = { record: vi.fn() };
  const notifications = { create: vi.fn() };

  const runner = new CampaignRunner(
    {} as never,
    prisma as never,
    providers as never,
    jobs as never,
    events as never,
    audit as never,
    notifications as never,
  );
  return { runner, prisma, providers, jobs, events, audit, notifications, sendLogs, updates, emitted };
}

const campaign = (over: AnyRec = {}): AnyRec => {
  const base: AnyRec = {
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
    scheduleTimes: [],
    scheduleDays: [],
    lastRunDay: null,
    lastRunSlot: null,
    targets: [],
    ...over,
  };
  // The runner only sends to groups belonging to the campaign's workspace, so
  // fixture groups default to that workspace unless a test sets one explicitly.
  base.targets = (base.targets as AnyRec[]).map((t) => ({
    ...t,
    group: t.group ? { workspaceSlug: base.workspaceSlug, ...t.group } : t.group,
  }));
  return base;
};

describe("CampaignRunner.isDue", () => {
  const { runner } = makeRunner();
  const isDue = (c: AnyRec, now: Date) =>
    (runner as unknown as { dueSlot: (c: AnyRec, n: Date) => string | null }).dueSlot(c, now) !==
    null;

  it("never runs paused or completed campaigns", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(isDue(campaign({ status: "pausada" }), now)).toBe(false);
    expect(isDue(campaign({ status: "completada" }), now)).toBe(false);
  });

  it("runs a one-off only once its scheduled instant has passed", () => {
    const c = campaign({
      scheduleType: "once",
      status: "programada",
      scheduleAt: "2026-01-01T10:00:00.000Z",
    });
    expect(isDue(c, new Date("2026-01-01T09:59:00Z"))).toBe(false);
    expect(isDue(c, new Date("2026-01-01T10:01:00Z"))).toBe(true);
  });

  it("runs a daily campaign at the matching local time, once per day", () => {
    const at = new Date();
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    const c = campaign({ scheduleType: "daily", status: "activa", scheduleAt: `${hh}:${mm}` });
    expect(isDue(c, at)).toBe(true);
    // Already ran this slot → skip (dedupe per "YYYY-MM-DDTHH:MM").
    const slot = `${new Date().toISOString().slice(0, 10)}T${hh}:${mm}`;
    expect(isDue({ ...c, lastRunSlot: slot }, at)).toBe(false);
  });

  it("runs a daily campaign at EACH of scheduleTimes (varias veces al día)", () => {
    const at = new Date();
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    // A different time that is NOT now, plus the current time → only "now" is due.
    const other = `${String((at.getHours() + 3) % 24).padStart(2, "0")}:${mm}`;
    const c = campaign({
      scheduleType: "daily",
      status: "activa",
      scheduleAt: "",
      scheduleTimes: [other, `${hh}:${mm}`],
    });
    expect(isDue(c, at)).toBe(true);
    // After running this slot, still due later for the OTHER time (different slot).
    const slot = `${new Date().toISOString().slice(0, 10)}T${hh}:${mm}`;
    expect(isDue({ ...c, lastRunSlot: slot }, at)).toBe(false);
  });

  it("catches up a daily slot that passed recently (PC turned on a bit late)", () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0); // fixed noon for deterministic math
    const past30 = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
    const past4h = new Date(now.getTime() - 4 * 60 * 60 * 1000); // 4 h ago
    const hhmm = (d: Date) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    // A slot 30 min ago is still due (within the 3h catch-up window).
    expect(
      isDue(campaign({ scheduleType: "daily", status: "activa", scheduleAt: hhmm(past30) }), now),
    ).toBe(true);
    // A slot 4 h ago is too old → skip (fires again next day).
    expect(
      isDue(campaign({ scheduleType: "daily", status: "activa", scheduleAt: hhmm(past4h) }), now),
    ).toBe(false);
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
    process.env.WHATSAPP_RETRY_BASE_MS = "0"; // instant backoff in tests
    process.env.WHATSAPP_MAX_ATTEMPTS = "3";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_GROUP_DELAY_MS;
    delete process.env.WHATSAPP_RETRY_BASE_MS;
    delete process.env.WHATSAPP_MAX_ATTEMPTS;
  });

  const retriableError = () => Object.assign(new Error("rate limited"), { retriable: true });

  it("retries a retriable WhatsApp send with backoff, then succeeds", async () => {
    const c = campaign({ targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }] });
    let calls = 0;
    const send = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw retriableError();
      return { id: "wamid.ok" };
    });
    const { runner, sendLogs } = makeRunner({ campaign: c, send });

    await runner.run("w1", "c1");

    expect(send).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    expect(sendLogs).toHaveLength(1);
    expect(sendLogs[0]!.ok).toBe(true);
  });

  it("does NOT retry a non-retriable WhatsApp send (fails fast)", async () => {
    const c = campaign({ targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }] });
    const send = vi.fn(async () => {
      throw Object.assign(new Error("token expirado"), { retriable: false });
    });
    const { runner, sendLogs } = makeRunner({ campaign: c, send });

    await runner.run("w1", "c1");

    expect(send).toHaveBeenCalledTimes(1); // no retries
    expect(sendLogs[0]!.ok).toBe(false);
  });

  it("gives up a retriable WhatsApp send after maxAttempts and logs failure", async () => {
    const c = campaign({ targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }] });
    const send = vi.fn(async () => {
      throw retriableError();
    });
    const { runner, sendLogs } = makeRunner({ campaign: c, send });

    await runner.run("w1", "c1");

    expect(send).toHaveBeenCalledTimes(3); // maxAttempts
    expect(sendLogs[0]!.ok).toBe(false);
  });

  it("retries a retriable social publish, then succeeds", async () => {
    const c = campaign({ channels: ["fb"], targets: [] });
    let calls = 0;
    const publish = vi.fn(async () => {
      calls += 1;
      return calls < 2
        ? { ok: false, retriable: true, error: "throttled" }
        : { ok: true, id: "p1" };
    });
    const { runner, sendLogs } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(publish).toHaveBeenCalledTimes(2);
    expect(sendLogs).toHaveLength(1);
    expect(sendLogs[0]!.ok).toBe(true);
  });

  it("does NOT retry a non-retriable social publish failure", async () => {
    const c = campaign({ channels: ["fb"], targets: [] });
    const publish = vi.fn(async () => ({ ok: false, retriable: false, error: "sin permiso" }));
    const { runner } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("delivers to every WhatsApp target and completes a one-off on full success", async () => {
    const c = campaign({
      targets: [
        { group: { id: "g1", name: "Grupo A", remoteJid: "1@g.us" } },
        { group: { id: "g2", name: "Grupo B", remoteJid: "2@g.us" } },
      ],
    });
    const { runner, providers, sendLogs, updates, emitted, notifications } = makeRunner({ campaign: c });

    await runner.run("w1", "c1");

    expect(notifications.create).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ type: "success", title: "Campaña «Promo» enviada", meta: expect.stringContaining("2 de 2") }),
    );
    expect(providers.sendMessage).toHaveBeenCalledTimes(2);
    expect(sendLogs).toHaveLength(2);
    expect(sendLogs.every((l) => l.ok === true)).toBe(true);
    expect(updates[0]!.status).toBe("completada");
    expect(updates[0]!.progress).toBe(100);
    expect(emitted).toEqual([
      {
        event: "campaign.completed",
        payload: expect.objectContaining({ campaignId: "c1", ok: true }),
      },
    ]);
  });

  it("rotates attachments: uses the next image and advances the cursor", async () => {
    const c = campaign({
      rotateAttachments: true,
      attachmentRotation: 1, // → picks index 1 of 2
      attachments: [
        { url: "a.png", kind: "image" },
        { url: "b.png", kind: "image" },
      ],
      targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }],
    });
    const { runner, providers, updates } = makeRunner({ campaign: c });

    await runner.run("w1", "c1");

    expect(providers.sendMedia).toHaveBeenCalledTimes(1);
    const arg = (providers.sendMedia.mock.calls[0] as unknown as unknown[])[2] as {
      attachment?: { url?: string };
    };
    expect(arg.attachment?.url).toBe("b.png");
    expect(updates[0]!.attachmentRotation).toBe(2); // cursor advanced
  });

  it("without rotation always uses the first attachment", async () => {
    const c = campaign({
      rotateAttachments: false,
      attachmentRotation: 5,
      attachments: [
        { url: "a.png", kind: "image" },
        { url: "b.png", kind: "image" },
      ],
      targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }],
    });
    const { runner, providers, updates } = makeRunner({ campaign: c });

    await runner.run("w1", "c1");

    const arg = (providers.sendMedia.mock.calls[0] as unknown as unknown[])[2] as {
      attachment?: { url?: string };
    };
    expect(arg.attachment?.url).toBe("a.png");
    expect(updates[0]!.attachmentRotation).toBeUndefined(); // cursor untouched
  });

  it("skips targets whose group belongs to another workspace (no send, no log)", async () => {
    const c = campaign({
      targets: [
        { group: { id: "g1", name: "Propio", remoteJid: "1@g.us" } }, // workspace w1
        { group: { id: "gX", name: "Ajeno", remoteJid: "9@g.us", workspaceSlug: "other" } },
      ],
    });
    const { runner, providers, sendLogs } = makeRunner({ campaign: c });

    await runner.run("w1", "c1");

    expect(providers.sendMessage).toHaveBeenCalledTimes(1);
    expect(sendLogs).toHaveLength(1);
    expect(sendLogs[0]!.groupName).toBe("Propio");
  });

  it("logs a failed send and marks a 'once' campaign 'completada' (anti-spam, no re-send)", async () => {
    const c = campaign({ targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }] });
    const send = vi.fn(async () => {
      throw new Error("proveedor caído");
    });
    const { runner, sendLogs, updates, prisma, notifications } = makeRunner({ campaign: c, send });
    prisma.sendLog.findFirst.mockImplementation(async (args?: { where?: AnyRec }) =>
      args?.where?.ok === false ? { error: "proveedor caído", groupName: "A" } : null,
    );

    await runner.run("w1", "c1");

    expect(notifications.create).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ type: "error", meta: expect.stringContaining("Motivo (A): proveedor caído") }),
    );
    expect(sendLogs).toHaveLength(1);
    expect(sendLogs[0]!.ok).toBe(false);
    expect(sendLogs[0]!.error).toMatch(/caído/);
    // ANTI-SPAM: aunque falle, una campaña "once" NO se re-arma; queda completada
    // para no reenviar al mismo chat en cada tick (evita ban).
    expect(updates[0]!.status).toBe("completada");
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

  it("files each published Instagram/Facebook post under the campaign", async () => {
    const c = campaign({ channels: ["wa", "ig"], targets: [] });
    const publish = vi.fn(async () => ({ ok: true, id: "p1", format: null }));
    const { runner, prisma } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(prisma.post.create).toHaveBeenCalledTimes(1);
    expect(prisma.post.create.mock.calls[0]![0].data).toMatchObject({
      campaignId: "c1",
      channel: "ig",
      title: "Promo",
      status: "sent",
    });
  });

  it("does not file a post whose publish failed", async () => {
    const c = campaign({ channels: ["ig"], targets: [] });
    const publish = vi.fn(async () => ({ ok: false, error: "token vencido" }));
    const { runner, prisma } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it("publishes to the WhatsApp Status when postToWaStatus is set", async () => {
    const c = campaign({ channels: ["wa"], targets: [], postToWaStatus: true });
    const publish = vi.fn(async () => ({ ok: true, id: "status.1", format: "status" }));
    const { runner, sendLogs } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(publish).toHaveBeenCalledTimes(1);
    expect((publish.mock.calls[0] as unknown[])[1]).toBe("whatsapp"); // provider id
    expect(sendLogs.map((l) => l.target)).toEqual(["wa_status"]);
    expect(sendLogs[0]!.ok).toBe(true);
  });

  it("retries a retriable WhatsApp Status publish, then succeeds", async () => {
    const c = campaign({ channels: ["wa"], targets: [], postToWaStatus: true });
    let calls = 0;
    const publish = vi.fn(async () => {
      calls += 1;
      return calls < 2
        ? { ok: false, retriable: true, error: "no está conectado", format: "status" }
        : { ok: true, id: "status.ok", format: "status" };
    });
    const { runner, sendLogs } = makeRunner({ campaign: c, publish });

    await runner.run("w1", "c1");

    expect(publish).toHaveBeenCalledTimes(2);
    expect(sendLogs[0]!.ok).toBe(true);
  });

  it("throws when the campaign does not belong to the workspace", async () => {
    const { runner } = makeRunner({ campaign: null });
    await expect(runner.run("w1", "missing")).rejects.toThrow(/no encontrada/);
  });
});

describe("CampaignRunner.run — seguros contra duplicados y pausa", () => {
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    process.env.WHATSAPP_RETRY_BASE_MS = "0";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_GROUP_DELAY_MS;
    delete process.env.WHATSAPP_RETRY_BASE_MS;
  });
  const g = (id: string, name: string) => ({ group: { id, name, remoteJid: `${id}@g.us` } });

  it("no se ejecuta dos veces: si otra ejecución ganó la reserva, no envía nada", async () => {
    const c = campaign({ targets: [g("g1", "Grupo 1")] });
    const { runner, prisma, providers, sendLogs } = makeRunner({ campaign: c });
    prisma.campaign.updateMany.mockResolvedValueOnce({ count: 0 });
    await runner.run("w1", "c1");
    expect(providers.sendMessage).not.toHaveBeenCalled();
    expect(sendLogs).toHaveLength(0);
  });

  it("no se relanza si corrió hace menos de 90 s (doble clic / reintento del navegador)", async () => {
    const c = campaign({ targets: [g("g1", "Grupo 1")], lastRunAt: new Date(Date.now() - 10_000) });
    const { runner, providers } = makeRunner({ campaign: c });
    await runner.run("w1", "c1");
    expect(providers.sendMessage).not.toHaveBeenCalled();
  });

  it("«Pausar» detiene el envío a mitad de la lista y no marca la campaña como completada", async () => {
    const c = campaign({ targets: [g("g1", "Grupo 1"), g("g2", "Grupo 2"), g("g3", "Grupo 3")] });
    const { runner, prisma, providers, updates } = makeRunner({ campaign: c });
    let reads = 0;
    prisma.campaign.findUnique.mockImplementation(async () => ({ status: ++reads >= 2 ? "pausada" : "programada" }));
    await runner.run("w1", "c1");
    expect(providers.sendMessage).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.status === "completada")).toBe(false);
  });

  it("no repite un chat que otra ejecución ya reservó (índice único por chat y ejecución)", async () => {
    const c = campaign({ targets: [g("g1", "Grupo 1")] });
    const { runner, providers, sendLogs } = makeRunner({ campaign: c });
    sendLogs.push({ id: "otro", campaignId: "c1", groupId: "g1", runKey: "k1", ok: false, error: "en curso…" });
    await runner.run("w1", "c1", { runKey: "k1" });
    expect(providers.sendMessage).not.toHaveBeenCalled();
  });

  it("«Enviar ahora» mantiene el anti-spam de 20 h: no repite un chat que ya lo recibió hoy", async () => {
    const c = campaign({ targets: [g("g1", "Grupo 1")] });
    const { runner, prisma, providers } = makeRunner({ campaign: c });
    prisma.sendLog.findFirst.mockResolvedValue({ id: "ya-enviado" });
    await runner.run("w1", "c1", { runKey: "manual:abc" });
    expect(providers.sendMessage).not.toHaveBeenCalled();
  });
});

describe("CampaignRunner — ejecuciones que sobreviven reinicios", () => {
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
    process.env.WHATSAPP_RETRY_BASE_MS = "0";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_GROUP_DELAY_MS;
    delete process.env.WHATSAPP_RETRY_BASE_MS;
  });
  const g = (id: string, name: string) => ({ group: { id, name, remoteJid: `${id}@g.us` } });
  const threeGroups = () => [g("g1", "Grupo 1"), g("g2", "Grupo 2"), g("g3", "Grupo 3")];
  const longAgo = () => new Date(Date.now() - 60 * 60 * 1000);

  it("la clave de una franja es estable: once → once:<fecha>, diaria → la franja", () => {
    expect(slotRunKey("once", "2026-10-24T10:00:00.000Z")).toBe("once:2026-10-24T10:00:00.000Z");
    expect(slotRunKey("2026-10-24T09:00", "09:00")).toBe("2026-10-24T09:00");
  });

  it("una franja programada envía aunque el chat recibió otra franja hoy (varias veces al día)", async () => {
    const c = campaign({ scheduleType: "daily", status: "activa", targets: [g("g1", "Grupo 1")] });
    const { runner, prisma, providers } = makeRunner({ campaign: c });
    // Antes, la ventana de 20 h saltaba en silencio la 2.ª franja del día.
    prisma.sendLog.findFirst.mockResolvedValue({ id: "franja-de-la-manana" });
    const out = await runner.run("w1", "c1", { runKey: "2026-10-24T18:00" });
    expect(providers.sendMessage).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ status: "completed", ok: true, sent: 1 });
  });

  it("reanuda tras un reinicio: no repite lo enviado, no reenvía lo dudoso y envía lo pendiente", async () => {
    const c = campaign({
      status: "activa",
      runKey: "once:x",
      runHeartbeatAt: longAgo(),
      lastRunAt: longAgo(),
      targets: threeGroups(),
    });
    const { runner, prisma, providers, sendLogs, updates, jobs } = makeRunner({ campaign: c });
    // Estado que dejó el proceso muerto: g1 entregado, g2 a mitad de envío.
    sendLogs.push(
      { id: "a", campaignId: "c1", groupId: "g1", runKey: "once:x", ok: true, error: null },
      { id: "b", campaignId: "c1", groupId: "g2", runKey: "once:x", ok: false, error: "en curso…" },
    );
    prisma.campaign.findMany.mockResolvedValueOnce([c]);

    expect(await runner.recoverInterruptedRuns()).toBe(1);
    expect(sendLogs.find((l) => l.id === "b")!.error).toBe(UNCONFIRMED);
    expect(jobs.dispatch).toHaveBeenCalledWith("campaign.run", "w1", {
      workspaceSlug: "w1",
      campaignId: "c1",
      runKey: "once:x",
      resume: true,
    });

    const out = await runner.run("w1", "c1", { runKey: "once:x", resume: true });
    expect(providers.sendMessage).toHaveBeenCalledTimes(1);
    expect((providers.sendMessage.mock.calls[0] as unknown[])[2]).toMatchObject({ to: "g3@g.us" });
    // g2 quedó sin confirmar → la ejecución NO se presenta como éxito total.
    expect(out).toEqual({ status: "completed", ok: false, sent: 2, failed: 1 });
    expect(updates.at(-1)).toMatchObject({ status: "completada", runKey: null, runHeartbeatAt: null });
  });

  it("el barrido no toca ejecuciones vivas y libera las pausadas sin reanudarlas", async () => {
    const paused = campaign({ status: "pausada", runKey: "once:x", runHeartbeatAt: longAgo() });
    const { runner, prisma, jobs } = makeRunner({ campaign: paused });
    prisma.campaign.findMany.mockResolvedValueOnce([paused]);
    expect(await runner.recoverInterruptedRuns()).toBe(0);
    expect(jobs.dispatch).not.toHaveBeenCalled();
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", runKey: "once:x" },
      data: { runKey: null, runHeartbeatAt: null },
    });
    // La consulta solo pide latidos vencidos (> 10 min por defecto).
    const where = (prisma.campaign.findMany.mock.calls[0] as unknown as [{ where: AnyRec }])[0].where;
    expect((where.runHeartbeatAt as { lt: Date }).lt.getTime()).toBeLessThan(Date.now() - 9 * 60 * 1000);
  });

  it("si dos procesos intentan reanudar, solo uno lo hace", async () => {
    const c = campaign({ status: "activa", runKey: "once:x", runHeartbeatAt: longAgo() });
    const { runner, prisma, jobs } = makeRunner({ campaign: c });
    prisma.campaign.findMany.mockResolvedValueOnce([c]);
    prisma.campaign.updateMany.mockResolvedValueOnce({ count: 0 }); // otro proceso ganó
    expect(await runner.recoverInterruptedRuns()).toBe(0);
    expect(jobs.dispatch).not.toHaveBeenCalled();
  });

  it("el reintento de un job continúa la misma ejecución sin duplicar chats", async () => {
    const c = campaign({ runKey: "manual:1", runHeartbeatAt: new Date(), lastRunAt: new Date(), targets: threeGroups() });
    const { runner, providers, sendLogs } = makeRunner({ campaign: c });
    sendLogs.push({ id: "a", campaignId: "c1", groupId: "g1", runKey: "manual:1", ok: true, error: null });
    await runner.run("w1", "c1", { runKey: "manual:1", attempt: 2 });
    expect(providers.sendMessage).toHaveBeenCalledTimes(2); // g2 y g3, nunca g1
  });

  it("no reanuda una ejecución que ya terminó (y no lo reporta como éxito)", async () => {
    const c = campaign({ runKey: null, targets: [g("g1", "Grupo 1")] });
    const { runner, providers } = makeRunner({ campaign: c });
    const out = await runner.run("w1", "c1", { runKey: "once:x", resume: true });
    expect(out.status).toBe("skipped");
    expect(providers.sendMessage).not.toHaveBeenCalled();
  });

  it("no arranca otra ejecución mientras hay una viva (latido reciente)", async () => {
    const c = campaign({ runKey: "manual:1", runHeartbeatAt: new Date(), lastRunAt: longAgo(), targets: [g("g1", "Grupo 1")] });
    const { runner, providers } = makeRunner({ campaign: c });
    const out = await runner.run("w1", "c1", { runKey: "manual:2" });
    expect(out).toMatchObject({ status: "skipped" });
    expect(providers.sendMessage).not.toHaveBeenCalled();
  });

  it("se detiene si otro proceso tomó el relevo de la ejecución (latido perdido)", async () => {
    const c = campaign({ targets: threeGroups() });
    const { runner, prisma, providers } = makeRunner({ campaign: c });
    prisma.campaign.updateMany
      .mockResolvedValueOnce({ count: 1 }) // reserva inicial
      .mockResolvedValueOnce({ count: 1 }) // latido antes de g1
      .mockResolvedValueOnce({ count: 0 }); // antes de g2: ya no es nuestra
    const out = await runner.run("w1", "c1", { runKey: "k" });
    expect(providers.sendMessage).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("skipped");
  });

  it("al reanudar no vuelve a publicar en Facebook lo ya publicado en esa ejecución", async () => {
    const c = campaign({ channels: ["fb"], runKey: "k", runHeartbeatAt: longAgo(), targets: [] });
    const publish = vi.fn(async () => ({ ok: true, id: "p1", format: null }));
    const { runner, prisma } = makeRunner({ campaign: c, publish });
    prisma.sendLog.findFirst.mockResolvedValue({ id: "ya-publicado" });
    await runner.run("w1", "c1", { runKey: "k", resume: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it("marca como «sin confirmar» las marcas «en curso» huérfanas de más de 30 min", async () => {
    const { runner, prisma } = makeRunner();
    await runner.recoverInterruptedRuns(new Date("2026-10-24T12:00:00Z"));
    expect(prisma.sendLog.updateMany).toHaveBeenCalledWith({
      where: { error: "en curso…", createdAt: { lt: new Date("2026-10-24T11:30:00Z") } },
      data: { ok: false, error: UNCONFIRMED },
    });
  });
});

describe("CampaignRunner.problems (antes de «Enviar ahora»)", () => {
  const withStatus = (states: Record<string, string>) => {
    const ctx = makeRunner({
      campaign: campaign({
        channels: ["wa", "ig"],
        targets: [{ groupId: "g1", group: { id: "g1", channel: "wa" } }],
      }),
    });
    (ctx.providers as AnyRec).status = vi.fn(async (_w: string, id: string) => ({
      state: states[id] ?? "disconnected",
      detail: states[id] ? undefined : "Sesión cerrada",
    }));
    return ctx;
  };

  it("no reporta nada cuando hay mensaje, destino y canales conectados", async () => {
    const { runner } = withStatus({ whatsapp: "connected", instagram: "connected" });
    expect(await runner.problems("w1", "c1")).toEqual([]);
  });

  it("dice qué canal falta conectar, con el motivo", async () => {
    const { runner } = withStatus({ whatsapp: "connected" });
    expect(await runner.problems("w1", "c1")).toEqual([
      "Instagram no está conectado (Sesión cerrada). Conéctalo en Conexiones.",
    ]);
  });

  it("pide mensaje y destino cuando la campaña está vacía", async () => {
    const { runner, providers } = makeRunner({ campaign: campaign({ message: "  ", channels: ["wa"], targets: [] }) });
    (providers as AnyRec).status = vi.fn();
    expect(await runner.problems("w1", "c1")).toEqual([
      "La campaña no tiene mensaje ni imagen.",
      "Elige al menos un grupo o una red social de destino.",
    ]);
  });

  it("ignora grupos de otra marca al decidir qué conectar", async () => {
    const { runner, providers } = makeRunner({
      campaign: campaign({ targets: [{ groupId: "g9", group: { id: "g9", channel: "wa", workspaceSlug: "otra" } }] }),
    });
    (providers as AnyRec).status = vi.fn();
    expect(await runner.problems("w1", "c1")).toEqual(["Elige al menos un grupo o una red social de destino."]);
  });
});

describe("CampaignRunner.run: reglas de grupo, precio y pie", () => {
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_DELAY_MS = "0";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_GROUP_DELAY_MS;
  });

  it("omite grupos que no aplican, pone el precio en la moneda del grupo y agrega el pie", async () => {
    const c = campaign({
      message: "Combo Netflix a {{precio}}",
      addFooter: true,
      prices: { VES: "350" },
      targets: [
        { group: { id: "g1", name: "Ventas Caracas", remoteJid: "1@g.us", requiresPrice: true } },
        { group: { id: "g2", name: "Grupo Uni", remoteJid: "2@g.us", category: "universidad" } },
        { group: { id: "g3", name: "Ofertas Madrid", remoteJid: "3@g.us", requiresPrice: true } },
      ],
    });
    const { runner, prisma, providers, sendLogs, notifications } = makeRunner({ campaign: c });
    (prisma as AnyRec).workspaceSettings = {
      findUnique: vi.fn(async () => ({
        socialLinks: [{ label: "Instagram", url: "https://instagram.com/tienda" }],
        website: "https://tienda.com",
      })),
    };

    await runner.run("w1", "c1");

    expect(providers.sendMessage).toHaveBeenCalledTimes(1);
    expect(providers.sendMessage).toHaveBeenCalledWith("w1", "whatsapp", {
      to: "1@g.us",
      body:
        "Combo Netflix a Bs 350\n\nInstagram: https://instagram.com/tienda\nWeb: https://tienda.com\n" +
        "Mensaje enviado con NV Marketing https://nvmarketing.nvcorx.com/",
    });
    expect(sendLogs).toHaveLength(1);
    const meta = (notifications.create.mock.calls[0]![1] as { meta: string }).meta;
    expect(meta).toContain("2 grupos omitidos");
    expect(meta).toContain("Grupo Uni (Es un grupo de «Universidad o estudios»");
    expect(meta).toContain("Ofertas Madrid (Exige precio y la campaña no tiene precio en Euros (€).)");
  });

  it("sin pie cuando la campaña lo desactiva", async () => {
    const c = campaign({ addFooter: false, targets: [{ group: { id: "g1", name: "A", remoteJid: "1@g.us" } }] });
    const { runner, providers } = makeRunner({ campaign: c });
    await runner.run("w1", "c1");
    expect(providers.sendMessage).toHaveBeenCalledWith("w1", "whatsapp", { to: "1@g.us", body: "Hola" });
  });

  it("«Enviar ahora» avisa si ningún grupo acepta la campaña", async () => {
    const { runner, providers } = makeRunner({
      campaign: campaign({ targets: [{ groupId: "g1", group: { id: "g1", name: "Equipo", channel: "wa", excluded: true } }] }),
    });
    (providers as AnyRec).status = vi.fn(async () => ({ state: "connected" }));
    expect(await runner.problems("w1", "c1")).toEqual([
      "Ningún grupo elegido acepta esta campaña (por ejemplo «Equipo»: Apartado: nunca se publica aquí.). Revisa precios, imagen o los grupos.",
    ]);
  });
});
