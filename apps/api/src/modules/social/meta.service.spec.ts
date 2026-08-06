import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetaService } from "./meta.service";

/**
 * Meta Graph publishing — the product's primary outbound social channel, which
 * had no test. `fetch` is stubbed and routed by URL so we exercise the real
 * request-shaping and result-mapping without touching the network.
 */

type Json = Record<string, unknown>;
const ok = (body: Json) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ error: { message } }),
});

function service(creds: {
  fb?: boolean;
  ig?: boolean;
} = { fb: true, ig: true }) {
  // prisma disabled → creds() uses the env fallback we set per-test.
  const prisma = { enabled: false, connection: { findMany: vi.fn(async () => []) } };
  const svc = new MetaService(prisma as never);
  if (creds.fb) {
    process.env.FB_PAGE_ID = "page123";
    process.env.FB_PAGE_TOKEN = "fbtoken";
  }
  if (creds.ig) {
    process.env.IG_BUSINESS_ID = "ig123";
    process.env.IG_ACCESS_TOKEN = "igtoken";
  }
  return svc;
}

const ENV_KEYS = ["FB_PAGE_ID", "FB_PAGE_TOKEN", "IG_BUSINESS_ID", "IG_ACCESS_TOKEN"];

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("MetaService.status / configured", () => {
  it("reports configured channels from env fallback", async () => {
    const svc = service({ fb: true, ig: false });
    // IG token falls back to the FB page token, so IG needs only a business id.
    const status = await svc.status("w1");
    expect(status.facebook).toBe(true);
    expect(status.instagram).toBe(false); // no IG business id
  });
});

describe("MetaService.publishFacebook", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts a text message to the page feed", async () => {
    const svc = service();
    const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ok({ id: "fb_feed_1" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await svc.publishFacebook(await svc.creds("w1"), { message: "Hola mundo" });
    expect(res).toEqual({ target: "facebook", ok: true, id: "fb_feed_1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/page123/feed");
    expect(String(init?.body)).toContain("message=Hola+mundo");
  });

  it("posts an image to /photos", async () => {
    const svc = service();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(String(url)).toContain("/photos");
      return ok({ post_id: "fb_photo_1" });
    }));
    const res = await svc.publishFacebook(await svc.creds("w1"), {
      message: "pie",
      attachments: [{ url: "https://cdn/x.jpg", kind: "image" }],
    });
    expect(res).toMatchObject({ ok: true, id: "fb_photo_1" });
  });

  it("publishes a video as a reel", async () => {
    const svc = service();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(String(url)).toContain("/video_reels");
      return ok({ video_id: "vid_1", post_id: "reel_1" });
    }));
    const res = await svc.publishFacebook(await svc.creds("w1"), {
      attachments: [{ url: "https://cdn/x.mp4", kind: "video" }],
    });
    expect(res).toMatchObject({ ok: true, id: "reel_1", format: "reel" });
  });

  it("throws when Facebook is not configured", async () => {
    const svc = service({ fb: false });
    await expect(svc.publishFacebook(await svc.creds("w1"), { message: "x" })).rejects.toThrow(
      /no configurado/,
    );
  });

  it("surfaces a Graph API error message", async () => {
    const svc = service();
    vi.stubGlobal("fetch", vi.fn(async () => fail(400, "Invalid OAuth token")));
    await expect(svc.publishFacebook(await svc.creds("w1"), { message: "x" })).rejects.toThrow(
      /Invalid OAuth token/,
    );
  });
});

describe("MetaService.publishInstagram", () => {
  it("creates a container then publishes an image feed post", async () => {
    const svc = service();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("/media_publish")) return ok({ id: "ig_final" });
      if (String(url).includes("/media")) return ok({ id: "container_1" });
      return ok({});
    }));
    const res = await svc.publishInstagram(await svc.creds("w1"), {
      message: "hi",
      attachments: [{ url: "https://cdn/x.jpg", kind: "image" }],
    });
    expect(res).toMatchObject({ target: "instagram", ok: true, id: "ig_final", format: "feed" });
    expect(calls.some((u) => u.includes("/ig123/media"))).toBe(true);
    expect(calls.some((u) => u.includes("/media_publish"))).toBe(true);
  });

  it("waits for a video container to finish before publishing a reel", async () => {
    const svc = service();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: unknown) => {
      const u = String(url);
      const isGet = !init || (init as { method?: string }).method !== "POST";
      if (u.includes("/media_publish")) return ok({ id: "ig_reel" });
      if (u.includes("/media")) return ok({ id: "container_v" }); // POST create
      if (isGet) return ok({ status_code: "FINISHED" }); // status poll
      return ok({});
    }));
    const res = await svc.publishInstagram(await svc.creds("w1"), {
      attachments: [{ url: "https://cdn/x.mp4", kind: "video" }],
      format: "reel",
    });
    expect(res).toMatchObject({ ok: true, id: "ig_reel", format: "reel" });
  });

  it("rejects a carousel with fewer than 2 items", async () => {
    const svc = service();
    vi.stubGlobal("fetch", vi.fn(async () => ok({ id: "c" })));
    await expect(
      svc.publishInstagram(await svc.creds("w1"), {
        format: "carousel",
        attachments: [{ url: "https://cdn/x.jpg", kind: "image" }],
      }),
    ).rejects.toThrow(/carrusel requiere/i);
  });

  it("requires at least one media item", async () => {
    const svc = service();
    await expect(
      svc.publishInstagram(await svc.creds("w1"), { message: "solo texto" }),
    ).rejects.toThrow(/imagen o video/i);
  });
});

describe("MetaService.publish (never throws)", () => {
  it("returns a per-target result, capturing failures as ok:false", async () => {
    const svc = service();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/page123/")) return ok({ id: "fb_1", post_id: "fb_1" });
      return fail(500, "IG boom"); // any /ig123/ call fails
    }));
    const results = await svc.publish("w1", ["facebook", "instagram"], {
      message: "hola",
      attachments: [{ url: "https://cdn/x.jpg", kind: "image" }],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ target: "facebook", ok: true });
    expect(results[1]).toMatchObject({ target: "instagram", ok: false });
    expect(results[1]!.error).toBeTruthy();
  });
});
