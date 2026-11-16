import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { InboxService } from "./inbox.module";
import { readMediaToken } from "./chat-media";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Inbox: nombres guardados, fotos y audios contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const mediaDir = mkdtempSync(join(tmpdir(), "nv-chat-"));
  const config = {
    get: (key: string) =>
      key === "auth" ? { secret: "it-secret" } : key === "apiUrl" ? "http://api.test" : key === "media" ? { dir: mediaDir } : undefined,
  };
  const registry = { exists: async () => true };
  const events = { emit: vi.fn(), on: vi.fn() };
  const wsName = `it-media-${Date.now().toString(36)}`;
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const whatsapp = {
    downloadChatMedia: vi.fn(async () => photo),
    sendChatFile: vi.fn(async () => ({ id: `WAOUT1-${wsName}` })),
  };
  const crypto = { encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.replace(/^enc:/, "") };
  const inbox = new InboxService(
    prisma as never,
    {} as never,
    config as never,
    registry as never,
    events as never,
    whatsapp as never,
    crypto as never,
  );
  const ws = wsName;
  const id = (x: string) => `${x}-${ws}`;

  it("names the chat as saved in the brand's phone, over the contact's own profile name", async () => {
    await inbox.recordInboundFor(ws, { channel: "wa", contactHandle: "+584120000001", contactName: "Anita ✨", text: "hola" });
    let conv = await prisma.conversation.findFirstOrThrow({ where: { workspaceSlug: ws, contactHandle: "+584120000001" } });
    expect(conv.contactName).toBe("Anita ✨");
    // Later the contact list arrives with the name saved in the phone.
    await inbox.applyContactNames(ws, "wa", [{ handle: "+584120000001", name: "Ana Clienta Caracas", saved: true }]);
    conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(conv.contactName).toBe("Ana Clienta Caracas");
    expect(conv.savedName).toBe("Ana Clienta Caracas");
    // The CRM contact that had the profile name takes it too.
    const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceSlug: ws } });
    expect(contact.name).toBe("Ana Clienta Caracas");
    // A new message with the profile name doesn't undo it; a profile-only name list neither.
    await inbox.recordInboundFor(ws, { channel: "wa", contactHandle: "+584120000001", contactName: "Anita ✨", text: "?" });
    await inbox.applyContactNames(ws, "wa", [{ handle: "+584120000001", name: "Anita ✨" }]);
    conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(conv.contactName).toBe("Ana Clienta Caracas");
  });

  it("keeps a received photo private, downloads it once and opens it only with its signed link", async () => {
    await inbox.recordInboundFor(ws, {
      channel: "wa",
      contactHandle: "+584120000002",
      contactName: "Luis",
      text: "📷 Foto precio",
      externalId: id("WAIN1"),
      media: { kind: "image", mime: "image/jpeg", size: photo.length },
      mediaRef: "sealed-message",
    });
    // Live messages are downloaded right away (in the background).
    await vi.waitFor(async () => {
      const m = await prisma.message.findFirstOrThrow({ where: { externalId: id("WAIN1") } });
      expect((m.media as { file?: string }).file).toMatch(/^[a-f0-9]{32}\.jpg$/);
    });
    const row = await prisma.message.findFirstOrThrow({ where: { externalId: id("WAIN1") } });
    expect(whatsapp.downloadChatMedia).toHaveBeenCalledWith(ws, null, "sealed-message", id("WAIN1"));
    expect((row.media as { ref?: string }).ref).toBeUndefined(); // sealed copy dropped once saved
    const file = (row.media as { file: string }).file;
    expect(readFileSync(join(mediaDir, ws, "chat", file))).toEqual(photo);

    const list = await inbox.messages(ws, row.conversationId);
    const shown = list.find((m) => m.id === row.id)!;
    expect(shown.media).toMatchObject({ kind: "image", mime: "image/jpeg", size: photo.length });
    const token = shown.media!.url!.split("/api/inbox-media/")[1]!;
    expect(readMediaToken("it-secret", token)).toEqual({ workspace: ws, messageId: row.id });
    // Another brand can't open it with its own messages list.
    expect(await inbox.messages("otra-marca", row.conversationId)).toEqual([]);

    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      sendFile: (_n: string, _o: unknown, cb: (e?: Error) => void) => cb(),
      headersSent: false,
      status: () => ({ json: () => undefined }),
    };
    await inbox.serveMedia(token, res as never);
    expect(headers["Content-Type"]).toBe("image/jpeg");
    expect(headers["Cache-Control"]).toContain("private");
    await expect(inbox.serveMedia(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), res as never)).rejects.toThrow();
    expect(whatsapp.downloadChatMedia).toHaveBeenCalledTimes(1);
  });

  it("history photos wait until someone opens them", async () => {
    whatsapp.downloadChatMedia.mockClear();
    await inbox.recordInboundFor(ws, {
      channel: "wa",
      contactHandle: "+584120000003",
      contactName: "Eva",
      text: "🎤 Nota de voz",
      externalId: id("WAHIST1"),
      history: true,
      media: { kind: "voice", mime: "audio/ogg", size: 900, seconds: 5 },
      mediaRef: "sealed-2",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(whatsapp.downloadChatMedia).not.toHaveBeenCalled();
    const row = await prisma.message.findFirstOrThrow({ where: { externalId: id("WAHIST1") } });
    expect((row.media as { ref: string }).ref).toBe("enc:sealed-2"); // encrypted at rest
  });

  it("sends a voice note recorded in the browser as a WhatsApp voice note", async () => {
    const conv = await prisma.conversation.findFirstOrThrow({ where: { workspaceSlug: ws, contactHandle: "+584120000002" } });
    const webm = readFileSync(join(__dirname, "__fixtures__", "voice-chrome.webm"));
    const msg = await inbox.sendMedia(ws, conv.id, { buffer: webm, mimetype: "audio/webm;codecs=opus", size: webm.length }, { as: "voice" });
    const sent = whatsapp.sendChatFile.mock.calls.at(-1) as unknown as [string, string, { kind: string; mime: string; bytes: Buffer; seconds: number }];
    expect(sent[1]).toBe("+584120000002");
    expect(sent[2].kind).toBe("voice");
    expect(sent[2].bytes.subarray(0, 4).toString("ascii")).toBe("OggS");
    expect(sent[2].seconds).toBeGreaterThanOrEqual(3);
    expect(msg.text).toBe("🎤 Nota de voz");
    expect(msg.media).toMatchObject({ kind: "voice", mime: "audio/ogg" });
    // The echo WhatsApp sends back for it is not stored twice.
    await inbox.recordInboundFor(ws, { channel: "wa", contactHandle: "+584120000002", contactName: "Luis", text: "🎤 Nota de voz", direction: "out", externalId: id("WAOUT1") });
    expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "out" } })).toBe(1);
    // Something that isn't a real file is refused before anything is sent.
    const calls = whatsapp.sendChatFile.mock.calls.length;
    await expect(
      inbox.sendMedia(ws, conv.id, { buffer: Buffer.from("<script>alert(1)</script>"), mimetype: "image/png", size: 25 }, {}),
    ).rejects.toThrow(/no se puede enviar/);
    expect(whatsapp.sendChatFile.mock.calls.length).toBe(calls);
  });

  it("pulse tells the panel the unread total and the newest message", async () => {
    const p = await inbox.pulse(ws);
    expect(p.unread).toBeGreaterThan(0);
    expect(p.latest).toMatchObject({ contactName: expect.any(String), at: expect.any(String) });
  });
});
