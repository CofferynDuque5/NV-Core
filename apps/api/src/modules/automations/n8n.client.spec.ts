import { describe, expect, it } from "vitest";

import { resolveWebhookUrl } from "./n8n.client";

describe("resolveWebhookUrl", () => {
  it("uses an absolute URL as-is, ignoring the base", () => {
    expect(resolveWebhookUrl("https://n8n.example.com", "https://hooks.other.com/x")).toBe(
      "https://hooks.other.com/x",
    );
    expect(resolveWebhookUrl(undefined, "https://hooks.other.com/x")).toBe(
      "https://hooks.other.com/x",
    );
  });

  it("joins a path onto the base, normalizing slashes", () => {
    expect(resolveWebhookUrl("https://n8n.example.com", "webhook/abc")).toBe(
      "https://n8n.example.com/webhook/abc",
    );
    expect(resolveWebhookUrl("https://n8n.example.com/", "/webhook/abc")).toBe(
      "https://n8n.example.com/webhook/abc",
    );
  });

  it("returns null for a relative path without a base URL", () => {
    expect(resolveWebhookUrl(undefined, "webhook/abc")).toBeNull();
    expect(resolveWebhookUrl("", "webhook/abc")).toBeNull();
  });
});
