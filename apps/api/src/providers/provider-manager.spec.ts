import { describe, expect, it } from "vitest";

import { ProviderManager } from "./provider-manager.service";
import type { ChannelAdapter, Provider, ProviderId } from "./provider.types";

function fakeAdapter(provider: ProviderId, id: string): ChannelAdapter {
  return {
    id,
    label: id,
    provider,
    connect: async () => ({ provider, adapter: id, state: "connected" }),
    disconnect: async () => ({ provider, adapter: id, state: "disconnected" }),
    authenticate: async () => ({ provider, adapter: id, state: "connected" }),
    refreshCredentials: async () => ({ provider, adapter: id, state: "connected" }),
    publish: async () => ({ ok: true, id: "p1" }),
    sendMessage: async () => ({ id: `${id}-msg` }),
    sendMedia: async () => ({ id: `${id}-media` }),
    healthCheck: async () => ({ provider, adapter: id, healthy: true, configured: true }),
    getStatus: async () => ({ provider, adapter: id, state: "connected" }),
  };
}

function fakeProvider(id: ProviderId, defaultAdapterId: string, adapterIds: string[]): Provider {
  const adapters = adapterIds.map((a) => fakeAdapter(id, a));
  return {
    id,
    label: id,
    defaultAdapterId,
    adapters,
    adapter: (aid: string) => adapters.find((a) => a.id === aid),
  };
}

/** Build a manager with in-memory selection (prisma disabled). */
function build(): ProviderManager {
  const prisma = { enabled: false } as never;
  const wa = fakeProvider("whatsapp", "baileys", ["baileys", "cloud-api"]);
  const fb = fakeProvider("facebook", "meta-graph", ["meta-graph", "browser-automation"]);
  const ig = fakeProvider("instagram", "meta-graph", ["meta-graph", "browser-automation"]);
  const email = fakeProvider("email", "resend", ["resend"]);
  const tk = fakeProvider("tiktok", "official-api", ["official-api"]);
  return new ProviderManager(prisma, wa as never, fb as never, ig as never, email as never, tk as never);
}

describe("ProviderManager", () => {
  it("falls back to the provider default adapter", async () => {
    const m = build();
    expect(await m.activeAdapterId("w1", "whatsapp")).toBe("baileys");
    expect(await m.activeAdapterId("w1", "facebook")).toBe("meta-graph");
  });

  it("persists and resolves the selected adapter", async () => {
    const m = build();
    await m.setActiveAdapter("w1", "whatsapp", "cloud-api");
    expect(await m.activeAdapterId("w1", "whatsapp")).toBe("cloud-api");
    // Other workspaces keep the default.
    expect(await m.activeAdapterId("w2", "whatsapp")).toBe("baileys");
  });

  it("rejects an unknown adapter", async () => {
    const m = build();
    await expect(m.setActiveAdapter("w1", "whatsapp", "nope")).rejects.toThrow();
  });

  it("delegates sendMessage to the active adapter", async () => {
    const m = build();
    expect((await m.sendMessage("w1", "whatsapp", { to: "x", body: "hi" })).id).toBe("baileys-msg");
    await m.setActiveAdapter("w1", "whatsapp", "cloud-api");
    expect((await m.sendMessage("w1", "whatsapp", { to: "x", body: "hi" })).id).toBe("cloud-api-msg");
  });

  it("maps channel ids to providers", () => {
    const m = build();
    expect(m.providerForChannel("wa")).toBe("whatsapp");
    expect(m.providerForChannel("ig")).toBe("instagram");
    expect(m.providerForChannel("email")).toBe("email");
    expect(m.providerForChannel("unknown")).toBeUndefined();
  });

  it("lists all providers with their adapters", async () => {
    const m = build();
    const list = await m.listProviders("w1");
    expect(list).toHaveLength(5);
    const wa = list.find((p) => p.id === "whatsapp")!;
    expect(wa.adapters.map((a) => a.id)).toEqual(["baileys", "cloud-api"]);
    expect(wa.activeAdapter).toBe("baileys");
  });
});
