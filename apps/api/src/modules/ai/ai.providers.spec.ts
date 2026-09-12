import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../config/configuration";
import { createProvider, selectProviderId } from "./ai.providers";

type AiConfig = AppConfig["integrations"]["ai"];

function ai(overrides: Partial<AiConfig>): AiConfig {
  return {
    models: { openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5", gemini: "gemini-1.5-flash" },
    ...overrides,
  };
}

describe("selectProviderId", () => {
  it("returns null when nothing is configured", () => {
    expect(selectProviderId(ai({}))).toBeNull();
  });

  it("prefers anthropic in the default priority order", () => {
    expect(selectProviderId(ai({ openai: "k", anthropic: "k", gemini: "k" }))).toBe("anthropic");
  });

  it("falls back to the only configured provider", () => {
    expect(selectProviderId(ai({ gemini: "k" }))).toBe("gemini");
  });

  it("honours an explicit provider when its key is present", () => {
    expect(selectProviderId(ai({ provider: "openai", openai: "k", anthropic: "k" }))).toBe("openai");
  });

  it("ignores an explicit provider whose key is missing", () => {
    expect(selectProviderId(ai({ provider: "openai", anthropic: "k" }))).toBe("anthropic");
  });
});

describe("createProvider", () => {
  it("returns null with no keys", () => {
    expect(createProvider(ai({}))).toBeNull();
  });

  it("builds a provider carrying the configured model", () => {
    const provider = createProvider(ai({ anthropic: "k", models: { openai: "o", anthropic: "claude-x", gemini: "g" } }));
    expect(provider?.id).toBe("anthropic");
    expect(provider?.model).toBe("claude-x");
  });
});

describe("createProvider fallback", () => {
  it("falls back to the next configured provider when the first has no credits", async () => {
    const calls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      calls.push(u.includes("openai") ? "openai" : u.includes("googleapis") ? "gemini" : "other");
      if (u.includes("openai")) {
        return { ok: false, status: 429, statusText: "Too Many Requests", text: async () => '{"error":{"code":"insufficient_quota"}}' } as never;
      }
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "desde gemini" }] } }] }),
      } as never;
    });
    const p = createProvider(ai({ openai: "sk-sin-saldo", gemini: "AIza" }))!;
    const out = await p.complete([{ role: "user", content: "hola" }]);
    expect(out).toBe("desde gemini");
    expect(calls).toEqual(["openai", "gemini"]);
    fetchSpy.mockRestore();
  });

  it("does not swallow non-availability errors (e.g. a malformed request)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 400, statusText: "Bad Request", text: async () => "bad",
    } as never);
    const p = createProvider(ai({ openai: "k", gemini: "k" }))!;
    await expect(p.complete([{ role: "user", content: "x" }])).rejects.toThrow(/400/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
