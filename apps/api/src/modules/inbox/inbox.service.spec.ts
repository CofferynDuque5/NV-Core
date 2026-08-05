import { describe, expect, it, vi } from "vitest";

import { InboxService } from "./inbox.module";
import type { PrismaService } from "../../prisma/prisma.service";

function makeDeps() {
  const conversations: { id: string; workspaceSlug: string; channel: string; contactName: string; contactHandle: string | null }[] = [];
  const messages: { conversationId: string; direction: string; text: string }[] = [];
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
    },
    message: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        messages.push({
          conversationId: String(data.conversationId),
          direction: String(data.direction),
          text: String(data.text),
        });
        return {};
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
  return { service, conversations, messages };
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
