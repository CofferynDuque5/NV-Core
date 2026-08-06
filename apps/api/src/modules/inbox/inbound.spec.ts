import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parseTelegramInbound, parseWhatsAppInbound, verifyMetaSignature } from "./inbound";

describe("verifyMetaSignature", () => {
  const secret = "app-secret-123";
  const raw = Buffer.from(JSON.stringify({ entry: [{ id: "1" }] }));
  const sign = (body: Buffer, key: string) =>
    "sha256=" + createHmac("sha256", key).update(body).digest("hex");

  it("accepts a correctly signed body", () => {
    expect(verifyMetaSignature(raw, sign(raw, secret), secret)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    expect(verifyMetaSignature(raw, sign(raw, "other"), secret)).toBe(false);
  });

  it("rejects a tampered body under a valid-looking signature", () => {
    const tampered = Buffer.from(JSON.stringify({ entry: [{ id: "2" }] }));
    expect(verifyMetaSignature(tampered, sign(raw, secret), secret)).toBe(false);
  });

  it("fails closed when the secret, header or body is missing/malformed", () => {
    expect(verifyMetaSignature(raw, sign(raw, secret), undefined)).toBe(false);
    expect(verifyMetaSignature(raw, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(undefined, sign(raw, secret), secret)).toBe(false);
    expect(verifyMetaSignature(raw, "deadbeef", secret)).toBe(false); // no sha256= prefix
    expect(verifyMetaSignature(raw, "sha256=", secret)).toBe(false); // empty digest
    expect(verifyMetaSignature(raw, "sha256=zz", secret)).toBe(false); // non-hex / short
  });
});

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
