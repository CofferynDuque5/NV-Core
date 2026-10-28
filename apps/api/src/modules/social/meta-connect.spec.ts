import { afterEach, describe, expect, it, vi } from "vitest";

import { MetaConnectService, buildMetaAuthUrl, metaErrorText } from "./meta-connect";
import { MetaGraphError } from "./meta.service";

/**
 * «Conectar Facebook e Instagram» — `fetch` is stubbed and routed by Graph
 * path, so the token exchange, Page listing and saving run without Meta.
 */

type Json = Record<string, unknown>;
const ok = (body: Json) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, code: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ error: { message, code } }),
});

function routeFetch(routes: Record<string, () => unknown>) {
  const fn = vi.fn(async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected ${path}`);
    return handler();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setup(app: { appId?: string; appSecret?: string } = {}) {
  const upserts: Json[] = [];
  const adapters: Json[] = [];
  const prisma = {
    enabled: true,
    providerSelection: {
      upsert: vi.fn(async (args: Json) => {
        adapters.push(args);
        return {};
      }),
    },
    connection: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async (args: Json) => {
        upserts.push(args);
        return {};
      }),
    },
  };
  const config = {
    get: (key: string) =>
      key === "integrations" ? { meta: app } : key === "apiUrl" ? "https://api.nv.test" : "https://app.nv.test",
  };
  const jwt = {
    signAsync: vi.fn(async (p: Json) => `signed:${JSON.stringify(p)}`),
    verifyAsync: vi.fn(async (s: string) => JSON.parse(s.replace(/^signed:/, ""))),
  };
  const meta = { creds: vi.fn(async () => ({ fbPageId: "p1", fbPageToken: "pt1", igBusinessId: "ig1", igToken: "pt1" })) };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new MetaConnectService(config as never, prisma as never, jwt as never, meta as never, audit as never);
  return { svc, prisma, upserts, adapters, audit };
}

const accounts = () =>
  ok({
    data: [
      { id: "p1", name: "Tienda Luna", category: "Tienda", access_token: "page-token-1", instagram_business_account: { id: "ig1", username: "tiendaluna" } },
      { id: "p2", name: "Sin IG", access_token: "page-token-2" },
    ],
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildMetaAuthUrl", () => {
  it("asks for the Page and Instagram publishing permissions", () => {
    const url = new URL(buildMetaAuthUrl({ appId: "123", redirectUri: "https://api.nv.test/api/integrations/meta/callback", state: "s" }));
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
    expect(url.searchParams.get("scope")).toContain("pages_manage_posts");
  });
});

describe("MetaConnectService", () => {
  it("lists Pages with their Instagram and never returns Page tokens", async () => {
    const { svc } = setup();
    routeFetch({ "me/accounts": accounts });
    const pages = await svc.pages("w1", { token: "user-token-xxxxxxxxxxxxxxxx" });
    expect(pages).toEqual([
      { id: "p1", name: "Tienda Luna", category: "Tienda", instagram: { id: "ig1", username: "tiendaluna" } },
      { id: "p2", name: "Sin IG", category: undefined, instagram: null },
    ]);
    expect(JSON.stringify(pages)).not.toContain("page-token");
  });

  it("exchanges a short token for a 60-day one when the app is configured", async () => {
    const { svc } = setup({ appId: "app", appSecret: "secret" });
    const fetchMock = routeFetch({
      "oauth/access_token": () => ok({ access_token: "long-token" }),
      "me/accounts": accounts,
    });
    await svc.pages("w1", { token: "short-token-xxxxxxxxxxxxxxx" });
    const accountsCall = fetchMock.mock.calls.find(([u]) => String(u).includes("me/accounts"))!;
    expect(new URL(String(accountsCall[0])).searchParams.get("access_token")).toBe("long-token");
  });

  it("accepts a Page token (where /me is the Page)", async () => {
    const { svc } = setup();
    routeFetch({
      "me/accounts": () => fail(400, 100, "(#100) Tried accessing nonexisting field (accounts)"),
      me: () => ok({ id: "p9", name: "Mi Página", category: "Marca" }),
    });
    const pages = await svc.pages("w1", { token: "page-token-xxxxxxxxxxxxxxxx" });
    expect(pages.map((p) => p.id)).toEqual(["p9"]);
  });

  it("explains an expired token in plain words", async () => {
    const { svc } = setup();
    routeFetch({
      "me/accounts": () => fail(400, 190, "Error validating access token: Session has expired"),
      me: () => fail(400, 190, "Error validating access token: Session has expired"),
    });
    await expect(svc.pages("w1", { token: "old-token-xxxxxxxxxxxxxxxxx" })).rejects.toThrow(/venció/);
  });

  it("saves Facebook and its Instagram in one step with the Page token", async () => {
    const { svc, upserts, adapters, audit } = setup();
    routeFetch({ "me/accounts": accounts });
    const page = await svc.connect("w1", "ana@nv.tv", { token: "user-token-xxxxxxxxxxxxxxxx", pageId: "p1" });
    expect(page.name).toBe("Tienda Luna");
    expect(upserts).toHaveLength(2);
    expect(upserts[0]).toMatchObject({ create: { channel: "fb", handle: "p1", token: "page-token-1", status: "ok" } });
    expect(upserts[1]).toMatchObject({ create: { channel: "ig", handle: "ig1", token: "page-token-1" } });
    expect(audit.record).toHaveBeenCalledWith("w1", "ana@nv.tv", "connection.meta", "Tienda Luna + Instagram");
    // Publishing switches from "Agente en tu PC" to the official Graph API for both.
    expect(adapters.map((a) => (a as { create: { provider: string; adapter: string } }).create)).toEqual([
      { workspaceSlug: "w1", provider: "facebook", adapter: "meta-graph" },
      { workspaceSlug: "w1", provider: "instagram", adapter: "meta-graph" },
    ]);
  });

  it("only saves Facebook when the Page has no Instagram or it is unticked", async () => {
    const { svc, upserts } = setup();
    routeFetch({ "me/accounts": accounts });
    await svc.connect("w1", "a", { token: "user-token-xxxxxxxxxxxxxxxx", pageId: "p1", instagram: false });
    await svc.connect("w1", "a", { token: "user-token-xxxxxxxxxxxxxxxx", pageId: "p2" });
    expect(upserts.map((u) => (u as { create: { channel: string } }).create.channel)).toEqual(["fb", "fb"]);
  });

  it("«Continuar con Facebook»: callback stores the token server-side and the pick works only for that brand", async () => {
    const { svc } = setup({ appId: "app", appSecret: "secret" });
    routeFetch({
      "oauth/access_token": () => ok({ access_token: "user-token" }),
      "me/accounts": accounts,
    });
    const url = await svc.authUrl("w1", "u1");
    const state = new URL(url).searchParams.get("state")!;
    const back = await svc.handleCallback("the-code", state);
    expect(back).toMatch(/^https:\/\/app\.nv\.test\/w\/w1\/conexiones\?meta=elige&pick=/);
    const pick = new URL(back).searchParams.get("pick")!;
    expect(back).not.toContain("user-token");
    expect(await svc.pages("w1", { pick })).toHaveLength(2);
    await expect(svc.pages("otra-marca", { pick })).rejects.toThrow(/expiró/);
  });

  it("refuses «Continuar con Facebook» without the app keys", async () => {
    const { svc } = setup();
    await expect(svc.authUrl("w1", "u1")).rejects.toThrow(/META_APP_ID/);
  });

  it("checks the saved connections against Meta", async () => {
    const { svc } = setup();
    routeFetch({
      p1: () => ok({ id: "p1", name: "Tienda Luna" }),
      ig1: () => fail(400, 10, "(#10) Application does not have permission"),
    });
    const check = await svc.check("w1");
    expect(check.facebook).toEqual({ ok: true, name: "Tienda Luna" });
    expect(check.instagram.ok).toBe(false);
    expect(check.instagram.error).toMatch(/Faltan permisos/);
  });

  it("metaErrorText falls back to Meta's message", () => {
    expect(metaErrorText(new MetaGraphError("Graph: algo raro", "unknown", 400))).toBe("Meta: algo raro");
  });
});
