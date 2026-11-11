import { describe, expect, it } from "vitest";

import { chatNotice, isPushEndpoint, isPushKeys } from "./push-rules";

describe("isPushEndpoint", () => {
  it("accepts only the browsers' push services over https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QAbc")).toBe(true);
    expect(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://127.0.0.1/fcm")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(isPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint(42)).toBe(false);
  });

  it("checks the browser keys' shape", () => {
    expect(isPushKeys("B".repeat(87), "a".repeat(22))).toBe(true);
    expect(isPushKeys("short", "a".repeat(22))).toBe(false);
    expect(isPushKeys("B".repeat(87), "<script>")).toBe(false);
  });
});

describe("chatNotice", () => {
  it("names the contact and the brand, and opens that chat", () => {
    const n = chatNotice({
      workspaceSlug: "mi-marca",
      workspaceName: "Mi Marca",
      conversationId: "c1",
      contactName: "Ana",
      text: "Hola,   ¿precio?",
      channel: "wa",
    });
    expect(n).toEqual({ title: "Ana (WhatsApp · Mi Marca)", body: "Hola, ¿precio?", url: "/w/mi-marca/inbox?c=c1", tag: "chat-c1" });
    expect(chatNotice({ workspaceSlug: "m", contactName: "B", text: "x".repeat(300), channel: "tg" }).body).toHaveLength(138);
  });
});
