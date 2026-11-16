import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { WhatsappService, parseWaLineKey, waLineKey } from "./whatsapp.service";

describe("WhatsApp lines", () => {
  it("keeps the brand slug for the main number and suffixes the others", () => {
    expect(waLineKey("nv-streaming-2")).toBe("nv-streaming-2");
    expect(waLineKey("nv-streaming-2", 3)).toBe("nv-streaming-2__n3");
    expect(parseWaLineKey("nv-streaming-2__n3")).toEqual({ workspaceSlug: "nv-streaming-2", line: 3 });
    expect(parseWaLineKey("nv-streaming-2")).toEqual({ workspaceSlug: "nv-streaming-2", line: 1 });
  });

  function make(group: { waLine: number } | null, conv: { waLine: number | null } | null) {
    const prisma = {
      enabled: true,
      group: { findFirst: vi.fn(async () => group) },
      conversation: { findFirst: vi.fn(async () => conv) },
    };
    const events = { emit: vi.fn() };
    const config = { get: () => ({ whatsappSessionDir: mkdtempSync(join(tmpdir(), "wa-")) }) };
    const svc = new WhatsappService(config as never, prisma as never, {} as never, events as never, {} as never);
    const fake = (name: string, connected = true) => ({
      isConnected: connected,
      sendToGroup: vi.fn(async () => ({ id: name })),
      sendText: vi.fn(async () => ({ id: name })),
    });
    const live = (svc as unknown as { live: Map<string, unknown> }).live;
    return { svc, live, fake, events };
  }

  it("sends to a group from the number that is in it", async () => {
    const { svc, live, fake } = make({ waLine: 2 }, null);
    live.set("w1", fake("main"));
    live.set("w1__n2", fake("second"));
    await expect(svc.sendToGroup("w1", "123@g.us", "hola")).resolves.toEqual({ id: "second" });
  });

  it("falls back to the main number when the group's number is offline", async () => {
    const { svc, live, fake } = make({ waLine: 2 }, null);
    live.set("w1", fake("main"));
    live.set("w1__n2", fake("second", false));
    await expect(svc.sendToGroup("w1", "123@g.us", "hola")).resolves.toEqual({ id: "main" });
  });

  it("answers a chat from the number the contact wrote to", async () => {
    const { svc, live, fake } = make(null, { waLine: 3 });
    live.set("w1", fake("main"));
    live.set("w1__n3", fake("third"));
    await expect(svc.sendText("w1", "584120000000", "hola")).resolves.toEqual({ id: "third" });
  });

  it("refuses when no number is connected, and tags inbound chats with their number", async () => {
    const { svc, events } = make(null, null);
    await expect(svc.sendText("w1", "5841", "hola")).rejects.toThrow(/no está conectado/);
    svc.onInbound("w1__n2", { contactHandle: "5841", contactName: "Ana", text: "hola" } as never);
    expect(events.emit).toHaveBeenCalledWith("session.inbound", expect.objectContaining({ workspaceSlug: "w1", waLine: 2 }));
  });
});
