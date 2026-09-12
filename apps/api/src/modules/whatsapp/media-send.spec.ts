import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaSendError, downloadMedia } from "./baileys.session";

/**
 * Media pre-download for WhatsApp sends: data: URLs decode locally, HTTP
 * failures and timeouts surface as clear errors (so the campaign falls back
 * to text and the Historial says why).
 */
afterEach(() => vi.restoreAllMocks());

describe("downloadMedia", () => {
  it("decodes a data: URL without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const buf = await downloadMedia(`data:image/png;base64,${Buffer.from("hola").toString("base64")}`);
    expect(buf.toString()).toBe("hola");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the bytes of an OK HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from("imagen").buffer.slice(0, 6),
    } as never);
    const buf = await downloadMedia("https://i.ibb.co/x/foto.jpg");
    expect(buf.length).toBe(6);
  });

  it("fails clearly on a non-OK status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as never);
    await expect(downloadMedia("https://i.ibb.co/x/nope.jpg")).rejects.toThrow(/HTTP 404/);
  });

  it("times out instead of hanging", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          (init as { signal: AbortSignal }).signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
    );
    await expect(downloadMedia("https://slow.example/x.jpg", 30)).rejects.toThrow(/tiempo de espera/);
  });

  it("MediaSendError is flagged so callers can fall back to text", () => {
    const e = new MediaSendError("x");
    expect(e.mediaFailed).toBe(true);
    expect(e).toBeInstanceOf(Error);
  });
});
