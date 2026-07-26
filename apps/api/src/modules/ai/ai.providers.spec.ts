import { describe, expect, it } from "vitest";

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
