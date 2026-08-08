import { describe, expect, it } from "vitest";

import { assertPublicWebhookUrl, isPrivateHostname, resolveWebhookUrl } from "./n8n.client";

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

describe("isPrivateHostname (SSRF guard)", () => {
  it("flags loopback, private, link-local and metadata hosts", () => {
    for (const h of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.1.2.3",
      "172.16.5.5",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "::1",
      "fd00::1",
      "fe80::1",
      "metadata.google.internal",
    ]) {
      expect(isPrivateHostname(h)).toBe(true);
    }
  });
  it("allows public hosts", () => {
    for (const h of ["hooks.n8n.cloud", "example.com", "8.8.8.8", "172.32.0.1", "203.0.113.5"]) {
      expect(isPrivateHostname(h)).toBe(false);
    }
  });
});

describe("assertPublicWebhookUrl", () => {
  it("throws on a private/internal target (SSRF)", () => {
    expect(() => assertPublicWebhookUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertPublicWebhookUrl("http://localhost:5678/x")).toThrow();
    expect(() => assertPublicWebhookUrl("http://10.0.0.5/webhook")).toThrow();
  });
  it("throws on a non-http(s) scheme", () => {
    expect(() => assertPublicWebhookUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicWebhookUrl("gopher://x")).toThrow();
  });
  it("allows a public https URL", () => {
    expect(() => assertPublicWebhookUrl("https://hooks.example.com/abc")).not.toThrow();
  });
});
