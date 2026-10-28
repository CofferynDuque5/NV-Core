import { describe, expect, it, vi } from "vitest";

import { InboxService } from "./inbox.module";
import type { PrismaService } from "../../prisma/prisma.service";

function makeDeps() {
  const conversations: { id: string; workspaceSlug: string; channel: string; contactName: string; contactHandle: string | null }[] = [];
  const messages: { id: string; conversationId: string; direction: string; text: string; externalId: string | null; createdAt: Date }[] = [];
  const contacts: { id: string; workspaceSlug: string; name: string; phone: string | null; tags: string[]; createdAt: Date }[] = [];
  let seq = 0;

  const prisma = {
    enabled: true,
    conversation: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        conversations.find(
          (c) =>
            c.workspaceSlug === where.workspaceSlug &&
            c.channel === where.channel &&
            c.contactHandle === where.contactHandle,
        ) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { workspaceSlug: string; channel: string; contactHandle: { in: string[] } } }) =>
        conversations.filter(
          (c) => c.workspaceSlug === where.workspaceSlug && c.channel === where.channel && where.contactHandle.in.includes(c.contactHandle ?? ""),
        ),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `c${++seq}`,
          workspaceSlug: String(data.workspaceSlug),
          channel: String(data.channel),
          contactName: String(data.contactName),
          contactHandle: (data.contactHandle as string) ?? null,
        };
        conversations.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = conversations.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    message: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) =>
        messages.find(
          (m) =>
            m.conversationId === where.conversationId &&
            (where.externalId === undefined || m.externalId === where.externalId) &&
            (where.direction === undefined || m.direction === where.direction) &&
            (where.text === undefined || m.text === where.text) &&
            (where.createdAt === undefined ||
              (m.createdAt >= where.createdAt.gte && m.createdAt <= where.createdAt.lte)),
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `m${++seq}`,
          conversationId: String(data.conversationId),
          direction: String(data.direction),
          text: String(data.text),
          externalId: (data.externalId as string | null) ?? null,
          createdAt: (data.createdAt as Date) ?? new Date(),
        };
        messages.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = messages.find((m) => m.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    contact: {
      findMany: vi.fn(async ({ where }: { where: { workspaceSlug: string } }) =>
        contacts.filter((c) => c.workspaceSlug === where.workspaceSlug),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ct${++seq}`,
          workspaceSlug: String(data.workspaceSlug),
          name: String(data.name),
          phone: (data.phone as string) ?? null,
          tags: (data.tags as string[]) ?? [],
          createdAt: new Date(),
        };
        contacts.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = contacts.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const config = { get: vi.fn(() => "nv-stream") };
  const registry = { exists: vi.fn(async () => true) };
  const events = { emit: vi.fn() };
  const service = new InboxService(
    prisma as unknown as PrismaService,
    {} as never,
    config as never,
    registry as never,
    events as never,
  );
  return { service, conversations, messages, contacts, events };
}

describe("InboxService.recordInbound", () => {
  it("creates a conversation for a new contact, then appends to it", async () => {
    const { service, conversations, messages } = makeDeps();

    await service.recordInbound({
      channel: "wa",
      contactHandle: "34600",
      contactName: "Ana",
      text: "Hola",
    });
    await service.recordInbound({
      channel: "wa",
      contactHandle: "34600",
      contactName: "Ana",
      text: "¿Precio?",
    });

    expect(conversations).toHaveLength(1);
    expect(messages).toHaveLength(2);
    expect(messages.every((m) => m.direction === "in")).toBe(true);
    expect(messages.map((m) => m.text)).toEqual(["Hola", "¿Precio?"]);
  });

  it("drops the message when no inbound workspace is configured", async () => {
    const { service, conversations } = makeDeps();
    // Override config to return no slug.
    (service as unknown as { config: { get: () => string | undefined } }).config = {
      get: () => undefined,
    };
    await service.recordInbound({ channel: "tg", contactHandle: "1", contactName: "X", text: "hi" });
    expect(conversations).toHaveLength(0);
  });
});

interface Conv {
  id: string;
  workspaceSlug: string;
  channel: string;
  contactName: string;
  contactHandle: string | null;
  resolved: boolean;
  assignee: string | null;
  labels: string[];
  createdAt: Date;
}

function makeUpdateService(seed: Conv) {
  const row = { ...seed };
  const prisma = {
    enabled: true,
    conversation: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
        where.id === row.id && where.workspaceSlug === row.workspaceSlug ? row : null,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const service = new InboxService(prisma as unknown as PrismaService, {} as never, { get: vi.fn() } as never, {} as never, { emit: vi.fn() } as never);
  return { service, row };
}

describe("InboxService.updateConversation", () => {
  const base: Conv = { id: "c1", workspaceSlug: "w1", channel: "wa", contactName: "Ana", contactHandle: null, resolved: false, assignee: null, labels: [], createdAt: new Date(0) };

  it("assigns and adds labels", async () => {
    const { service, row } = makeUpdateService(base);
    const res = await service.updateConversation("w1", "c1", { assignee: "ana@x", labels: ["ventas", "urgente"] });
    expect(res.assignee).toBe("ana@x");
    expect(res.labels).toEqual(["ventas", "urgente"]);
    expect(row.resolved).toBe(false); // untouched
  });

  it("unassigns with an empty string (→ null)", async () => {
    const { service, row } = makeUpdateService({ ...base, assignee: "ana@x" });
    await service.updateConversation("w1", "c1", { assignee: "" });
    expect(row.assignee).toBeNull();
  });

  it("resolves without touching labels/assignee", async () => {
    const { service, row } = makeUpdateService({ ...base, assignee: "ana@x", labels: ["ventas"] });
    await service.updateConversation("w1", "c1", { resolved: true });
    expect(row.resolved).toBe(true);
    expect(row.assignee).toBe("ana@x");
    expect(row.labels).toEqual(["ventas"]);
  });

  it("throws when the conversation is missing", async () => {
    const { service } = makeUpdateService(base);
    await expect(service.updateConversation("w1", "nope", { resolved: true })).rejects.toThrow(/no encontrada/);
  });
});

describe("InboxService.recordInboundFor (live sessions)", () => {
  it("persists an inbound message into the explicit workspace", async () => {
    const { service, conversations, messages } = makeDeps();
    await service.recordInboundFor("mi-ws", {
      channel: "wa",
      contactHandle: "5215500000000",
      contactName: "Ana",
      text: "hola, ¿precio?",
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.workspaceSlug).toBe("mi-ws");
    expect(conversations[0]!.channel).toBe("wa");
    expect(messages[0]!.direction).toBe("in");
    expect(messages[0]!.text).toBe("hola, ¿precio?");
  });

  it("reuses the same conversation for the same contact", async () => {
    const { service, conversations, messages } = makeDeps();
    const msg = { channel: "wa" as const, contactHandle: "521550", contactName: "Ana", text: "1" };
    await service.recordInboundFor("mi-ws", msg);
    await service.recordInboundFor("mi-ws", { ...msg, text: "2" });
    expect(conversations).toHaveLength(1);
    expect(messages).toHaveLength(2);
  });
});

describe("InboxService.recordInboundFor (WhatsApp history, own messages, contacts)", () => {
  const at = new Date("2026-10-20T15:00:00Z");

  it("stores each WhatsApp message once (same id twice)", async () => {
    const { service, messages } = makeDeps();
    const msg = { channel: "wa" as const, contactHandle: "+584121234567", contactName: "Ana", text: "hola", at, externalId: "ABC" };
    await service.recordInboundFor("mi-ws", msg);
    await service.recordInboundFor("mi-ws", { ...msg, history: true });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.createdAt).toEqual(at);
  });

  it("stores what you send from the phone as outgoing, without firing automations", async () => {
    const { service, messages, events } = makeDeps();
    await service.recordInboundFor("mi-ws", {
      channel: "wa",
      contactHandle: "+584121234567",
      contactName: "+584121234567",
      text: "Te paso los precios",
      direction: "out",
      at,
      externalId: "OUT1",
    });
    expect(messages[0]!.direction).toBe("out");
    expect(events.emit).not.toHaveBeenCalledWith("message.received", expect.anything());
  });

  it("does not duplicate the echo of a reply typed in the panel", async () => {
    const { service, messages, conversations } = makeDeps();
    await service.recordInboundFor("mi-ws", { channel: "wa", contactHandle: "+584121234567", contactName: "Ana", text: "hola", at });
    messages.push({ id: "panel", conversationId: conversations[0]!.id, direction: "out", text: "¡Hola Ana!", externalId: null, createdAt: at });
    await service.recordInboundFor("mi-ws", {
      channel: "wa",
      contactHandle: "+584121234567",
      contactName: "+584121234567",
      text: "¡Hola Ana!",
      direction: "out",
      at: new Date(at.getTime() + 5_000),
      externalId: "WA-ID",
    });
    expect(messages.filter((m) => m.direction === "out")).toHaveLength(1);
    expect(messages.find((m) => m.id === "panel")!.externalId).toBe("WA-ID");
  });

  it("history is stored but never counts as a new message", async () => {
    const { service, messages, events } = makeDeps();
    await service.recordInboundFor("mi-ws", {
      channel: "wa",
      contactHandle: "+584121234567",
      contactName: "Ana",
      text: "viejo",
      at,
      externalId: "H1",
      history: true,
    });
    expect(messages).toHaveLength(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("creates a CRM contact for a new WhatsApp number, with the name", async () => {
    const { service, contacts } = makeDeps();
    await service.recordInboundFor("mi-ws", { channel: "wa", contactHandle: "+584121234567", contactName: "Ana Pérez", text: "hola" });
    await service.recordInboundFor("mi-ws", { channel: "wa", contactHandle: "+584121234567", contactName: "Ana Pérez", text: "otra" });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: "Ana Pérez", phone: "+584121234567", tags: ["whatsapp"] });
  });

  it("takes the chat name from the CRM when WhatsApp only sends the number", async () => {
    const { service, contacts, conversations } = makeDeps();
    contacts.push({ id: "k1", workspaceSlug: "mi-ws", name: "Luisa Gómez", phone: "+58 412-1234567", tags: [], createdAt: new Date(0) });
    await service.recordInboundFor("mi-ws", { channel: "wa", contactHandle: "+584121234567", contactName: "+584121234567", text: "hola" });
    expect(conversations[0]!.contactName).toBe("Luisa Gómez");
  });

  it("never links a real chat to an old example contact with the same number", async () => {
    const { service, contacts, conversations } = makeDeps();
    contacts.push({ id: "ex", workspaceSlug: "mi-ws", name: "María González", phone: "+584129109871", tags: [], createdAt: new Date(0) });
    await service.recordInboundFor("mi-ws", { channel: "wa", contactHandle: "+584129109871", contactName: "+584129109871", text: "Cómo así" });
    expect(conversations[0]!.contactName).toBe("+584129109871");
    expect(contacts).toHaveLength(2); // a real contact was created next to the example one
  });

  it("names from the WhatsApp contact list replace bare numbers", async () => {
    const { service, conversations, contacts } = makeDeps();
    await service.recordInboundFor("mi-ws", { channel: "wa", contactHandle: "+584121234567", contactName: "+584121234567", text: "hola" });
    const n = await service.applyContactNames("mi-ws", "wa", [{ handle: "+584121234567", name: "Ana Pérez" }]);
    expect(n).toBe(1);
    expect(conversations[0]!.contactName).toBe("Ana Pérez");
    expect(contacts[0]!.name).toBe("Ana Pérez");
  });
});
