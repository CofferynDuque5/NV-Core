import { describe, expect, it } from "vitest";

import { parseTelegramInbound, parseWhatsAppInbound } from "./inbound";

describe("parseWhatsAppInbound", () => {
  it("extracts text messages with the contact name", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "34600111222", profile: { name: "Ana" } }],
                messages: [{ from: "34600111222", type: "text", text: { body: "Hola!" } }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWhatsAppInbound(body)).toEqual([
      { channel: "wa", contactHandle: "34600111222", contactName: "Ana", text: "Hola!" },
    ]);
  });

  it("falls back to the phone number when no profile name", () => {
    const body = {
      entry: [{ changes: [{ value: { messages: [{ from: "34600", type: "text", text: { body: "hi" } }] } }] }],
    };
    expect(parseWhatsAppInbound(body)[0]?.contactName).toBe("34600");
  });

  it("skips non-text messages and malformed bodies", () => {
    expect(
      parseWhatsAppInbound({
        entry: [{ changes: [{ value: { messages: [{ from: "1", type: "image" }] } }] }],
      }),
    ).toEqual([]);
    expect(parseWhatsAppInbound({})).toEqual([]);
    expect(parseWhatsAppInbound(null)).toEqual([]);
  });
});

describe("parseTelegramInbound", () => {
  it("maps a chat message with a composed name", () => {
    expect(
      parseTelegramInbound({
        message: { chat: { id: 12345, first_name: "Ana", last_name: "P" }, text: "Hola" },
      }),
    ).toEqual({ channel: "tg", contactHandle: "12345", contactName: "Ana P", text: "Hola" });
  });

  it("falls back to username then id", () => {
    expect(
      parseTelegramInbound({ message: { chat: { id: 9, username: "anap" }, text: "x" } })?.contactName,
    ).toBe("anap");
  });

  it("returns null without a message or text", () => {
    expect(parseTelegramInbound({})).toBeNull();
    expect(parseTelegramInbound({ message: { chat: { id: 1 } } })).toBeNull();
  });
});
