import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTelegram, sendWhatsApp } from "./messaging.transport";

function mockFetch(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(res as unknown as Response);
}

afterEach(() => vi.restoreAllMocks());

describe("sendWhatsApp (Cloud API transport)", () => {
  it("returns the message id on success", async () => {
    mockFetch(200, { messages: [{ id: "wamid.1" }] });
    const res = await sendWhatsApp(
      { token: "t", phoneNumberId: "123" },
      { channel: "wa", to: "5215500000000", body: "hola" },
    );
    expect(res.id).toBe("wamid.1");
  });

  it("throws with the Graph error on failure", async () => {
    mockFetch(400, { error: "bad" });
    await expect(
      sendWhatsApp({ token: "t", phoneNumberId: "123" }, { channel: "wa", to: "x", body: "y" }),
    ).rejects.toThrow(/WhatsApp/);
  });
});

describe("sendTelegram (Bot API transport)", () => {
  it("returns the message id on success", async () => {
    mockFetch(200, { ok: true, result: { message_id: 42 } });
    const res = await sendTelegram({ botToken: "b" }, { channel: "tg", to: "999", body: "hi" });
    expect(res.id).toBe("42");
  });

  it("throws when Telegram responds not-ok", async () => {
    mockFetch(200, { ok: false });
    await expect(
      sendTelegram({ botToken: "b" }, { channel: "tg", to: "999", body: "hi" }),
    ).rejects.toThrow(/Telegram/);
  });
});
