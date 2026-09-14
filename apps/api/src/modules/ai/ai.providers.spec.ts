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

  it("prefers gemini in the default priority order", () => {
    expect(selectProviderId(ai({ openai: "k", anthropic: "k", gemini: "k" }))).toBe("gemini");
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
      if (u.includes("googleapis")) {
        return { ok: false, status: 429, statusText: "Too Many Requests", text: async () => '{"error":{"status":"RESOURCE_EXHAUSTED"}}' } as never;
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "desde openai" } }] }),
      } as never;
    });
    const p = createProvider(ai({ openai: "sk", gemini: "AIza-agotada" }))!;
    const out = await p.complete([{ role: "user", content: "hola" }]);
    expect(out).toBe("desde openai");
    expect(calls).toEqual(["gemini", "openai"]);
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

describe("Gemini model discovery", () => {
  it("picks the newest stable flash model for text and an image model for flyers", async () => {
    const { __rankGemini, resolveGeminiModel } = await import("./ai.providers");
    const names = [
      "models/gemini-2.5-flash",
      "models/gemini-2.5-pro",
      "models/gemini-3-flash-preview",
      "models/gemini-3.1-flash",
      "models/gemini-3.1-flash-lite",
      "models/gemini-3.1-pro",
      "models/gemini-2.5-flash-image",
      "models/gemini-3-pro-image-preview",
      "models/gemini-embedding-001",
      "models/gemini-2.5-flash-preview-tts",
    ];
    expect(__rankGemini(names, "text")).toBe("gemini-3.1-flash");
    expect(__rankGemini(names, "image")).toBe("gemini-3-pro-image-preview");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ models: names.map((n) => ({ name: n, supportedGenerationMethods: ["generateContent"] })) }),
    } as never);
    expect(await resolveGeminiModel("AIza-test-key", "auto", "text")).toBe("gemini-3.1-flash");
    // An explicit model name is respected as-is.
    expect(await resolveGeminiModel("AIza-test-key", "gemini-2.5-flash", "text")).toBe("gemini-2.5-flash");
    vi.restoreAllMocks();
  });
});
