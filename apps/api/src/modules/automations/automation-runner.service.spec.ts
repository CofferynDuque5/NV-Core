import { describe, expect, it, vi } from "vitest";

import { AutomationRunnerService, WAIT_UNCONFIRMED, waitDurationMs } from "./automation-runner.service";

/**
 * The native runner: an incoming WhatsApp/Telegram message must walk every
 * active flow whose trigger matches and actually dispatch the actions
 * (AI reply, fixed message, contact creation, notification, human hand-off),
 * with the anti-spam cooldown holding between flows.
 */

type Handler = (p: {
  workspaceSlug: string;
  channel: string;
  contactHandle: string;
  contactName: string;
  text: string;
}) => Promise<void>;

function build(flows: unknown[]) {
  let handler: Handler | null = null;
  const events = { on: vi.fn((_e: string, h: Handler) => { handler = h; return () => undefined; }) };
  const contacts: unknown[] = [];
  const outbox: { to: string; body: string }[] = [];
  const messages: unknown[] = [];
  type Wait = Record<string, unknown>;
  const waits: Wait[] = [];
  let wseq = 0;
  const match = (w: Wait, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "lte" in (v as object)
        ? !!w[k] && (w[k] as Date).getTime() <= ((v as { lte: Date }).lte).getTime()
        : w[k] === v,
    );
  const prisma = {
    enabled: true,
    automation: {
      // Mirrors the real query: only active flows of the workspace come back.
      findMany: vi.fn(async ({ where }: { where: { status: string } }) =>
        flows.filter((f) => (f as { status: string }).status === where.status),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        flows.find((f) => (f as { id: string }).id === where.id) ?? null,
      ),
      update: vi.fn(async () => ({})),
    },
    automationWait: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => waits.find((w) => match(w, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => waits.filter((w) => match(w, where))),
      create: vi.fn(async ({ data }: { data: Wait }) => {
        const row = { id: `w${++wseq}`, status: "pending", startedAt: null, error: null, ...data };
        waits.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Wait }) => {
        const hit = waits.filter((w) => match(w, where));
        hit.forEach((w) => Object.assign(w, data));
        return { count: hit.length };
      }),
    },
    contact: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: unknown }) => { contacts.push(data); return data; }),
    },
    conversation: {
      findFirst: vi.fn(async () => ({ id: "conv1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    message: { create: vi.fn(async ({ data }: { data: unknown }) => { messages.push(data); return data; }) },
  };
  const providers = { sendByChannel: vi.fn(async (_ws: string, _ch: string, to: string, body: string) => { outbox.push({ to, body }); }) };
  const ai = { chat: vi.fn(async () => ({ reply: "Netflix cuesta $3.5/mes. ¿Te lo activo?" })) };
  const notifications = { create: vi.fn(async () => ({})) };
  const optedOut = new Set<string>();
  const consent = { isHandleOptedOut: vi.fn(async (_ws: string, h: string) => optedOut.has(h)) };
  const svc = new AutomationRunnerService(
    events as never,
    prisma as never,
    providers as never,
    ai as never,
    notifications as never,
    consent as never,
  );
  svc.onModuleInit();
  const fire = (text: string, handle = "+573001112233") =>
    handler!({ workspaceSlug: "ws", channel: "wa", contactHandle: handle, contactName: "Ana", text });
  return { svc, fire, prisma, providers, ai, notifications, outbox, contacts, messages, waits, optedOut };
}

const salesFlow = {
  id: "f1",
  name: "Agente de ventas",
  status: "activo",
  nodes: [
    { id: "t", type: "trigger", label: "Mensaje", config: { event: "message.received" } },
    { id: "c", type: "action", label: "Contacto", config: { kind: "create_contact", stage: "Lead", tag: "netflix" } },
    { id: "cond", type: "cond", label: "¿Compra?", config: { field: "intent", equals: "compra" } },
    { id: "ai", type: "action", label: "IA", config: { kind: "ai_reply", prompt: "Vende streaming." } },
    { id: "n", type: "action", label: "Aviso", config: { kind: "notify" } },
    { id: "h", type: "action", label: "Humano", config: { kind: "assign_human" } },
  ],
  edges: [
    { id: "e1", from: "t", to: "c" },
    { id: "e2", from: "c", to: "cond" },
    { id: "e3", from: "cond", to: "ai", branch: "true" },
    { id: "e4", from: "cond", to: "h", branch: "false" },
    { id: "e5", from: "ai", to: "n" },
  ],
};

describe("AutomationRunnerService", () => {
  it("subscribes to incoming messages on init", () => {
    const { prisma } = build([]);
    expect(prisma.automation.findMany).not.toHaveBeenCalled();
  });

  it("runs the sales flow: creates the contact, answers with AI and notifies", async () => {
    const { fire, ai, outbox, contacts, messages, notifications, prisma } = build([salesFlow]);
    await fire("Hola, ¿cuánto cuesta Netflix?");

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ workspaceSlug: "ws", name: "Ana", stage: "Lead", tags: ["netflix"] });
    expect(ai.chat).toHaveBeenCalledWith("ws", expect.objectContaining({ system: "Vende streaming." }));
    expect(outbox).toEqual([{ to: "+573001112233", body: "Netflix cuesta $3.5/mes. ¿Te lo activo?" }]);
    // The reply is mirrored into the Inbox thread.
    expect(messages[0]).toMatchObject({ conversationId: "conv1", direction: "out" });
    expect(notifications.create).toHaveBeenCalledWith("ws", expect.objectContaining({ type: "info" }));
    expect(prisma.automation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "f1" }, data: { runs: { increment: 1 } } }),
    );
  });

  it("takes the false branch (hand-off to a human) when there is no buying intent", async () => {
    const { fire, ai, outbox, notifications, prisma } = build([salesFlow]);
    await fire("hola buenas");

    expect(ai.chat).not.toHaveBeenCalled();
    expect(outbox).toHaveLength(0);
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { labels: { push: "requiere-humano" } } }),
    );
    expect(notifications.create).toHaveBeenCalledWith("ws", expect.objectContaining({ type: "warning" }));
  });

  it("never sends twice to the same chat inside the cooldown window", async () => {
    const { fire, outbox } = build([salesFlow]);
    await fire("quiero comprar netflix");
    await fire("quiero comprar disney");
    expect(outbox).toHaveLength(1);
  });

  it("ignores paused flows and triggers whose keywords do not match", async () => {
    const paused = { ...salesFlow, id: "f2", status: "pausado" };
    const keyed = {
      ...salesFlow,
      id: "f3",
      nodes: salesFlow.nodes.map((n) =>
        n.id === "t" ? { ...n, config: { event: "message.received", contains: ["cobro", "pago"] } } : n,
      ),
    };
    const { fire, outbox, ai } = build([paused, keyed]);
    await fire("quiero comprar netflix");
    expect(ai.chat).not.toHaveBeenCalled();
    expect(outbox).toHaveLength(0);
  });

  it("substitutes {{nombre}} in fixed messages", async () => {
    const flow = {
      id: "f4",
      name: "Bienvenida",
      status: "activo",
      nodes: [
        { id: "t", type: "trigger", label: "Mensaje", config: {} },
        { id: "m", type: "action", label: "Msg", config: { kind: "send_message", body: "Hola {{nombre}}, ya te atiendo." } },
      ],
      edges: [{ id: "e1", from: "t", to: "m" }],
    };
    const { fire, outbox } = build([flow]);
    await fire("hola");
    expect(outbox[0]?.body).toBe("Hola Ana, ya te atiendo.");
  });

  describe("nodo «esperar»", () => {
    const followUp = (status = "activo") => ({
      id: "f5",
      name: "Seguimiento",
      status,
      workspaceSlug: "ws",
      nodes: [
        { id: "t", type: "trigger", label: "Mensaje", config: {} },
        { id: "m1", type: "action", label: "Hola", config: { kind: "send_message", body: "Hola {{nombre}}" } },
        { id: "w", type: "wait", label: "Esperar", config: { duration: "1h" } },
        { id: "m2", type: "action", label: "Seguimiento", config: { kind: "send_message", body: "¿Pudiste verlo?" } },
      ],
      edges: [
        { id: "e1", from: "t", to: "m1" },
        { id: "e2", from: "m1", to: "w" },
        { id: "e3", from: "w", to: "m2" },
      ],
    });
    const later = (ms: number) => new Date(Date.now() + ms);

    it("pausa el flujo y lo reanuda a su hora desde el paso siguiente", async () => {
      const { svc, fire, outbox, waits } = build([followUp()]);
      await fire("hola");
      expect(outbox.map((o) => o.body)).toEqual(["Hola Ana"]);
      expect(waits).toHaveLength(1);
      expect(waits[0]).toMatchObject({ status: "pending", nextNodeId: "m2", contactHandle: "+573001112233" });

      // Antes de la hora no pasa nada.
      expect(await svc.resumeDue(later(30 * 60_000))).toBe(0);
      expect(outbox).toHaveLength(1);

      // Vencida: envía el seguimiento aunque el último envío fue hace < 30 s.
      expect(await svc.resumeDue(later(61 * 60_000))).toBe(1);
      expect(outbox.map((o) => o.body)).toEqual(["Hola Ana", "¿Pudiste verlo?"]);
      expect(waits[0]!.status).toBe("done");

      // Idempotente: no se reanuda dos veces.
      expect(await svc.resumeDue(later(120 * 60_000))).toBe(0);
      expect(outbox).toHaveLength(2);
    });

    it("una sola espera pendiente por contacto aunque escriba varias veces", async () => {
      const { fire, waits } = build([followUp()]);
      await fire("hola");
      await fire("hola otra vez");
      await fire("¿hay alguien?");
      expect(waits).toHaveLength(1);
    });

    it("si el flujo se pausa durante la espera, se cancela sin enviar", async () => {
      const flow = followUp();
      const { svc, fire, outbox, waits } = build([flow]);
      await fire("hola");
      flow.status = "pausado";
      await svc.resumeDue(later(2 * 3_600_000));
      expect(outbox).toHaveLength(1);
      expect(waits[0]!.status).toBe("cancelled");
    });

    it("si el envío falla al reanudar, queda como fallida y avisa", async () => {
      const { svc, fire, providers, notifications, waits } = build([followUp()]);
      await fire("hola");
      providers.sendByChannel.mockRejectedValueOnce(new Error("WhatsApp desconectado"));
      await svc.resumeDue(later(2 * 3_600_000));
      expect(waits[0]).toMatchObject({ status: "failed", error: "WhatsApp desconectado" });
      expect(notifications.create).toHaveBeenCalledWith("ws", expect.objectContaining({ type: "error" }));
    });

    it("una reanudación cortada por un reinicio se marca sin confirmar y no se repite", async () => {
      const { svc, fire, outbox, waits } = build([followUp()]);
      await fire("hola");
      Object.assign(waits[0]!, { status: "running", startedAt: new Date(Date.now() - 20 * 60_000) });
      await svc.resumeDue(later(2 * 3_600_000));
      expect(waits[0]).toMatchObject({ status: "failed", error: WAIT_UNCONFIRMED });
      expect(outbox).toHaveLength(1);
    });

    it("interpreta las duraciones del editor y rechaza las inválidas", () => {
      expect(waitDurationMs({ duration: "5m" })).toBe(5 * 60_000);
      expect(waitDurationMs({ duration: "1h" })).toBe(3_600_000);
      expect(waitDurationMs({ duration: "3d" })).toBe(3 * 86_400_000);
      expect(waitDurationMs({ hours: 2 })).toBe(2 * 3_600_000);
      expect(waitDurationMs({ duration: "999d" })).toBe(30 * 86_400_000);
      expect(waitDurationMs({ duration: "pronto" })).toBeNull();
      expect(waitDurationMs({})).toBeNull();
    });
  });

  describe("bajas", () => {
    const welcome = {
      id: "f6",
      name: "Bienvenida",
      status: "activo",
      workspaceSlug: "ws",
      nodes: [
        { id: "t", type: "trigger", label: "Mensaje", config: {} },
        { id: "m", type: "action", label: "Msg", config: { kind: "send_message", body: "Hola" } },
        { id: "w", type: "wait", label: "Esperar", config: { duration: "1h" } },
        { id: "m2", type: "action", label: "Msg2", config: { kind: "send_message", body: "¿Seguimos?" } },
      ],
      edges: [
        { id: "e1", from: "t", to: "m" },
        { id: "e2", from: "m", to: "w" },
        { id: "e3", from: "w", to: "m2" },
      ],
    };

    it("no contesta a un «BAJA» con ningún flujo", async () => {
      const { fire, outbox, waits } = build([welcome]);
      await fire("BAJA");
      await fire("Stop!");
      expect(outbox).toHaveLength(0);
      expect(waits).toHaveLength(0);
    });

    it("no escribe a un contacto dado de baja, ni con IA ni al reanudar una espera", async () => {
      const { svc, fire, outbox, ai, optedOut } = build([welcome, salesFlow]);
      await fire("hola");
      expect(outbox).toHaveLength(1);
      optedOut.add("+573001112233");
      await svc.resumeDue(new Date(Date.now() + 2 * 3_600_000));
      await fire("quiero comprar netflix", "+573001112233");
      expect(outbox).toHaveLength(1);
      expect(ai.chat).not.toHaveBeenCalled();
    });
  });
});
