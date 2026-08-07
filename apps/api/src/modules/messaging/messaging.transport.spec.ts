import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WhatsAppApiError,
  classifyWhatsAppError,
  sendTelegram,
  sendWhatsApp,
  sendWhatsAppMedia,
  sendWhatsAppTemplate,
} from "./messaging.transport";

const WA = { token: "TOKEN", phoneNumberId: "PN123", verifyToken: "vt" };

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

/** Capture the JSON body of the first fetch call. */
function firstBody(spy: ReturnType<typeof mockFetch>): Record<string, unknown> {
  const init = spy.mock.calls[0]![1] as { body: string };
  return JSON.parse(init.body);
}

afterEach(() => vi.restoreAllMocks());

describe("sendWhatsApp (Cloud API transport)", () => {
  it("returns the message id on success and shapes the request", async () => {
    const spy = mockFetch(200, { messages: [{ id: "wamid.1" }] });
    const res = await sendWhatsApp(WA, { channel: "wa", to: "5215500000000", body: "hola" });
    expect(res.id).toBe("wamid.1");
    const [url, init] = spy.mock.calls[0]! as [string, { headers: Record<string, string> }];
    expect(url).toContain("/PN123/messages");
    expect(init.headers.authorization).toBe("Bearer TOKEN");
    expect(firstBody(spy)).toMatchObject({ type: "text", text: { body: "hola" } });
  });

  it("throws with the Graph error on failure", async () => {
    mockFetch(400, { error: "bad" });
    await expect(
      sendWhatsApp(WA, { channel: "wa", to: "x", body: "y" }),
    ).rejects.toThrow(/WhatsApp/);
  });

  it("throws an auth error when unconfigured", async () => {
    await expect(
      sendWhatsApp({ verifyToken: "x" } as never, { channel: "wa", to: "1", body: "x" }),
    ).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("sendWhatsAppMedia", () => {
  it("sends an image by link with a caption", async () => {
    const spy = mockFetch(200, { messages: [{ id: "wamid.IMG" }] });
    const res = await sendWhatsAppMedia(WA, {
      to: "34600",
      body: "pie de foto",
      attachment: { url: "https://cdn/x.jpg", kind: "image" },
    });
    expect(res.id).toBe("wamid.IMG");
    expect(firstBody(spy)).toMatchObject({
      type: "image",
      image: { link: "https://cdn/x.jpg", caption: "pie de foto" },
    });
  });

  it("sends a document with a filename and no caption", async () => {
    const spy = mockFetch(200, { messages: [{ id: "wamid.DOC" }] });
    await sendWhatsAppMedia(WA, {
      to: "34600",
      attachment: { url: "https://cdn/f.pdf", kind: "document", filename: "factura.pdf" },
    });
    const body = firstBody(spy) as { document: Record<string, unknown> };
    expect(body).toMatchObject({ type: "document", document: { link: "https://cdn/f.pdf", filename: "factura.pdf" } });
    expect(body.document.caption).toBeUndefined();
  });

  it("treats an unknown media kind as a document", async () => {
    const spy = mockFetch(200, { messages: [{ id: "x" }] });
    await sendWhatsAppMedia(WA, { to: "1", attachment: { url: "https://cdn/z", kind: "audio" } });
    expect(firstBody(spy).type).toBe("document");
  });
});

describe("sendWhatsAppTemplate", () => {
  it("sends a template with language and positional variables", async () => {
    const spy = mockFetch(200, { messages: [{ id: "wamid.TPL" }] });
    await sendWhatsAppTemplate(WA, {
      to: "34600",
      template: "recordatorio_cita",
      language: "es",
      variables: ["Ana", "mañana 10:00"],
    });
    expect(firstBody(spy)).toMatchObject({
      type: "template",
      template: {
        name: "recordatorio_cita",
        language: { code: "es" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "mañana 10:00" }] },
        ],
      },
    });
  });

  it("omits components when there are no variables and defaults the language", async () => {
    const spy = mockFetch(200, { messages: [{ id: "x" }] });
    await sendWhatsAppTemplate(WA, { to: "1", template: "hello_world" });
    const body = firstBody(spy) as { template: { components?: unknown; language: { code: string } } };
    expect(body.template.components).toBeUndefined();
    expect(body.template.language.code).toBe("es");
  });
});

describe("WhatsApp error taxonomy", () => {
  const cases: { code: number; status: number; kind: string; retriable: boolean }[] = [
    { code: 190, status: 401, kind: "auth", retriable: false },
    { code: 613, status: 400, kind: "rate_limit", retriable: true },
    { code: 80007, status: 400, kind: "rate_limit", retriable: true },
    { code: 131052, status: 400, kind: "media", retriable: false },
    { code: 131047, status: 400, kind: "recipient", retriable: false },
    { code: 999999, status: 400, kind: "unknown", retriable: false },
  ];
  for (const c of cases) {
    it(`classifies Graph code ${c.code} as ${c.kind} (retriable=${c.retriable})`, () => {
      const err = classifyWhatsAppError(c.status, { error: { code: c.code, message: "x" } });
      expect(err).toBeInstanceOf(WhatsAppApiError);
      expect(err.kind).toBe(c.kind);
      expect(err.retriable).toBe(c.retriable);
      expect(err.code).toBe(c.code);
    });
  }

  it("classifies a 5xx with no code as transient (retriable)", () => {
    const err = classifyWhatsAppError(503, {});
    expect(err.kind).toBe("transient");
    expect(err.retriable).toBe(true);
  });

  it("sendWhatsApp surfaces a classified auth error from an expired token", async () => {
    mockFetch(401, { error: { code: 190, message: "Session expired", type: "OAuthException" } });
    await expect(sendWhatsApp(WA, { channel: "wa", to: "1", body: "x" })).rejects.toMatchObject({
      kind: "auth",
      code: 190,
    });
  });

  it("maps a network failure to a transient error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(sendWhatsApp(WA, { channel: "wa", to: "1", body: "x" })).rejects.toMatchObject({
      kind: "transient",
    });
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
