import { afterEach, describe, expect, it, vi } from "vitest";

import { AyrshareService } from "./ayrshare.service";

/**
 * Ayrshare transport — the single-key path for Facebook/Instagram. `fetch` is
 * stubbed so we exercise request-shaping and result-mapping without the network.
 */

type Json = Record<string, unknown>;
const ok = (body: Json) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, body: Json) => ({ ok: false, status, json: async () => body });

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AYRSHARE_API_KEY;
  delete process.env.AYRSHARE_PROFILE_KEY;
});

describe("AyrshareService", () => {
  it("is unconfigured without an API key and does not hit the network", async () => {
    const svc = new AyrshareService();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(svc.configured()).toBe(false);
    const [r] = await svc.publish(["facebook"], { message: "hola" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/pnpm ayrshare/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts a text update to Facebook and maps the returned id", async () => {
    process.env.AYRSHARE_API_KEY = "test-key";
    const svc = new AyrshareService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok({ status: "success", postIds: [{ platform: "facebook", id: "fb_1", postUrl: "http://x" }] }) as never,
    );

    const [r] = await svc.publish(["facebook"], { message: "hola" });

    expect(r.ok).toBe(true);
    expect(r.id).toBe("fb_1");
    expect(r.url).toBe("http://x");
    // Request shape: bearer auth + JSON body with post + platforms.
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/post");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.platforms).toEqual(["facebook"]);
    expect(body.post).toBe("hola");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer test-key" });
  });

  it("rejects an Instagram post with no media before calling the API", async () => {
    process.env.AYRSHARE_API_KEY = "test-key";
    const svc = new AyrshareService();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const [r] = await svc.publish(["instagram"], { message: "sin imagen" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/imagen o video/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes mediaUrls and passes the Profile-Key header when set", async () => {
    process.env.AYRSHARE_API_KEY = "test-key";
    process.env.AYRSHARE_PROFILE_KEY = "prof-1";
    const svc = new AyrshareService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok({ status: "success", postIds: [{ platform: "instagram", id: "ig_1" }] }) as never,
    );

    const [r] = await svc.publish(["instagram"], {
      message: "con foto",
      attachments: [{ url: "https://img/1.jpg", kind: "image" }],
    });

    expect(r.ok).toBe(true);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.mediaUrls).toEqual(["https://img/1.jpg"]);
    expect((init as RequestInit).headers).toMatchObject({ "Profile-Key": "prof-1" });
  });

  it("classifies a 429 as retriable and surfaces the API message", async () => {
    process.env.AYRSHARE_API_KEY = "test-key";
    const svc = new AyrshareService();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      fail(429, { status: "error", message: "Rate limited" }) as never,
    );
    const [r] = await svc.publish(["facebook"], { message: "hola" });
    expect(r.ok).toBe(false);
    expect(r.retriable).toBe(true);
    expect(r.error).toBe("Rate limited");
  });

  it("treats a network throw as retriable", async () => {
    process.env.AYRSHARE_API_KEY = "test-key";
    const svc = new AyrshareService();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const [r] = await svc.publish(["facebook"], { message: "hola" });
    expect(r.ok).toBe(false);
    expect(r.retriable).toBe(true);
    expect(r.error).toMatch(/red no disponible/i);
  });
});
