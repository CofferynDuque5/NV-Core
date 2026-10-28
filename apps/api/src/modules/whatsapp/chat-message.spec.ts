import { describe, expect, it } from "vitest";

import { chatJid, contactName, historyMessages, messageDate, messageText, toChatMessage } from "./chat-message";

const pn = "584121234567@s.whatsapp.net";

describe("chatJid", () => {
  it("keeps phone-number chats and skips groups, status and channels", () => {
    expect(chatJid({ remoteJid: pn })).toBe(pn);
    expect(chatJid({ remoteJid: "123@g.us" })).toBeNull();
    expect(chatJid({ remoteJid: "status@broadcast" })).toBeNull();
    expect(chatJid({ remoteJid: "1@newsletter" })).toBeNull();
  });

  it("resolves a hidden-number (@lid) chat from the key or the contact list", () => {
    expect(chatJid({ remoteJid: "999@lid", remoteJidAlt: pn })).toBe(pn);
    expect(chatJid({ remoteJid: "999@lid", senderPn: pn })).toBe(pn);
    expect(chatJid({ remoteJid: "999@lid" }, new Map([["999@lid", pn]]))).toBe(pn);
    expect(chatJid({ remoteJid: "999@lid" })).toBe("999@lid");
  });
});

describe("messageText", () => {
  it("reads text, captions and wrapped messages", () => {
    expect(messageText({ conversation: "hola" })).toBe("hola");
    expect(messageText({ extendedTextMessage: { text: "link" } })).toBe("link");
    expect(messageText({ ephemeralMessage: { message: { conversation: "temporal" } } })).toBe("temporal");
    expect(messageText({ imageMessage: { caption: "precio?" } })).toBe("📷 Foto precio?");
  });

  it("labels media without text, and ignores reactions and system messages", () => {
    expect(messageText({ imageMessage: {} })).toBe("📷 Foto");
    expect(messageText({ audioMessage: { ptt: true } })).toBe("🎤 Nota de voz");
    expect(messageText({ documentMessage: { fileName: "lista.pdf" } })).toBe("📄 lista.pdf");
    expect(messageText({ stickerMessage: {} })).toBe("Sticker");
    expect(messageText({ reactionMessage: { text: "👍" } })).toBe("");
    expect(messageText({ protocolMessage: {} })).toBe("");
    expect(messageText(undefined)).toBe("");
  });
});

describe("messageDate", () => {
  it("reads seconds as number, string or Long", () => {
    expect(messageDate(1_700_000_000).toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(messageDate({ low: 1_700_000_000 }).getTime()).toBe(1_700_000_000_000);
    expect(messageDate({ toNumber: () => 1_700_000_000 }).getTime()).toBe(1_700_000_000_000);
    const now = new Date();
    expect(messageDate(undefined, now)).toBe(now);
  });
});

describe("toChatMessage", () => {
  it("received message: contact's name, direction in", () => {
    const m = toChatMessage({ key: { remoteJid: pn, id: "A1" }, pushName: "Ana", messageTimestamp: 1_700_000_000, message: { conversation: "hola" } });
    expect(m).toMatchObject({ handle: "+584121234567", name: "Ana", text: "hola", direction: "in", externalId: "A1" });
  });

  it("message sent from the phone: direction out, never the operator's own name", () => {
    const m = toChatMessage({ key: { remoteJid: pn, fromMe: true, id: "B1" }, pushName: "Nathan", message: { conversation: "listo" } });
    expect(m).toMatchObject({ direction: "out", name: null });
  });

  it("skips groups and unresolved hidden numbers", () => {
    expect(toChatMessage({ key: { remoteJid: "1@g.us" }, message: { conversation: "x" } })).toBeNull();
    expect(toChatMessage({ key: { remoteJid: "9@lid" }, message: { conversation: "x" } })).toBeNull();
  });
});

describe("historyMessages", () => {
  it("keeps the last N per chat, both directions, oldest first", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      key: { remoteJid: pn, fromMe: i % 2 === 1, id: `H${i}` },
      messageTimestamp: 1_700_000_000 + i,
      message: { conversation: `m${i}` },
    }));
    const out = historyMessages(rows, undefined, 3);
    expect(out.map((m) => m.text)).toEqual(["m2", "m3", "m4"]);
    expect(out.map((m) => m.direction)).toEqual(["in", "out", "in"]);
  });
});

describe("contactName", () => {
  it("prefers the name saved in the phone, then the profile name", () => {
    expect(contactName({ name: "Ana (clienta)", notify: "Ana" })).toBe("Ana (clienta)");
    expect(contactName({ notify: "Ana" })).toBe("Ana");
    expect(contactName({ verifiedName: "Tienda X" })).toBe("Tienda X");
    expect(contactName({})).toBeNull();
  });
});
