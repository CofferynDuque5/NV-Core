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
  const service = new InboxService(
    prisma as unknown as PrismaService,
    {} as never,
    config as never,
    registry as never,
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
