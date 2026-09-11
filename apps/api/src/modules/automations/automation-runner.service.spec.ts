import { describe, expect, it, vi } from "vitest";

import { AutomationRunnerService } from "./automation-runner.service";

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
  const prisma = {
    enabled: true,
    automation: {
      // Mirrors the real query: only active flows of the workspace come back.
      findMany: vi.fn(async ({ where }: { where: { status: string } }) =>
        flows.filter((f) => (f as { status: string }).status === where.status),
      ),
      update: vi.fn(async () => ({})),
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
  const svc = new AutomationRunnerService(events as never, prisma as never, providers as never, ai as never, notifications as never);
  svc.onModuleInit();
  const fire = (text: string, handle = "+573001112233") =>
    handler!({ workspaceSlug: "ws", channel: "wa", contactHandle: handle, contactName: "Ana", text });
  return { fire, prisma, providers, ai, notifications, outbox, contacts, messages };
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
});
