import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../config/configuration";
import { buildCatalog } from "./integrations.module";

function integrations(overrides: Partial<AppConfig["integrations"]> = {}): AppConfig["integrations"] {
  return {
    n8n: {},
    ai: {
      openai: undefined,
      anthropic: undefined,
      gemini: undefined,
      models: { openai: "o", anthropic: "a", gemini: "g" },
    },
    whatsapp: {},
    meta: {},
    telegram: {},
    whatsappSessionDir: "data/whatsapp",
    telegramSessionDir: "data/telegram",
    imgbb: {},
    google: {},
    stripe: {},
    cloudinary: {},
    resend: {},
    ...overrides,
  };
}

describe("buildCatalog", () => {
  it("marks everything disconnected with empty config", () => {
    const catalog = buildCatalog(integrations());
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((i) => i.connected === false)).toBe(true);
  });

  it("carries a deep-link module + setup hint for every integration", () => {
    const catalog = buildCatalog(integrations());
    expect(catalog.every((i) => Boolean(i.module) && Boolean(i.setupHint))).toBe(true);
    expect(catalog.find((i) => i.id === "n8n")?.module).toBe("automatizaciones");
    expect(catalog.find((i) => i.id === "whatsapp")?.module).toBe("conexiones");
  });

  it("marks a provider connected when its key is present", () => {
    const catalog = buildCatalog(
      integrations({
        ai: { anthropic: "key", models: { openai: "o", anthropic: "a", gemini: "g" } },
      }),
    );
    expect(catalog.find((i) => i.id === "anthropic")?.connected).toBe(true);
    expect(catalog.find((i) => i.id === "openai")?.connected).toBe(false);
  });

  it("requires both fields for compound integrations (whatsapp)", () => {
    const partial = buildCatalog(integrations({ whatsapp: { token: "t" } }));
    expect(partial.find((i) => i.id === "whatsapp")?.connected).toBe(false);

    const full = buildCatalog(integrations({ whatsapp: { token: "t", phoneNumberId: "p" } }));
    expect(full.find((i) => i.id === "whatsapp")?.connected).toBe(true);
  });
});
