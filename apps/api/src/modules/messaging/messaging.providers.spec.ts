import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../config/configuration";
import { isChannelConfigured, isMessagingChannel } from "./messaging.providers";

function integrations(overrides: Partial<AppConfig["integrations"]> = {}): AppConfig["integrations"] {
  return {
    n8n: {},
    ai: { models: { openai: "o", anthropic: "a", gemini: "g" } },
    whatsapp: {},
    meta: {},
    telegram: {},
    whatsappSessionDir: "data/whatsapp",
    google: {},
    stripe: {},
    cloudinary: {},
    resend: {},
    ...overrides,
  };
}

describe("isMessagingChannel", () => {
  it("accepts wa and tg only", () => {
    expect(isMessagingChannel("wa")).toBe(true);
    expect(isMessagingChannel("tg")).toBe(true);
    expect(isMessagingChannel("email")).toBe(false);
    expect(isMessagingChannel("ig")).toBe(false);
  });
});

describe("isChannelConfigured", () => {
  it("is false for every channel with empty config", () => {
    const cfg = integrations();
    expect(isChannelConfigured(cfg, "wa")).toBe(false);
    expect(isChannelConfigured(cfg, "tg")).toBe(false);
  });

  it("requires both token and phone number id for WhatsApp", () => {
    expect(isChannelConfigured(integrations({ whatsapp: { token: "t" } }), "wa")).toBe(false);
    expect(
      isChannelConfigured(integrations({ whatsapp: { token: "t", phoneNumberId: "p" } }), "wa"),
    ).toBe(true);
  });

  it("requires a bot token for Telegram", () => {
    expect(isChannelConfigured(integrations({ telegram: { botToken: "b" } }), "tg")).toBe(true);
  });

  it("is false for unsupported channels", () => {
    expect(isChannelConfigured(integrations({ telegram: { botToken: "b" } }), "email")).toBe(false);
  });
});
