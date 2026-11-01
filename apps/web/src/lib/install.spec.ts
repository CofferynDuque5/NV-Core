import { describe, expect, it } from "vitest";

import { INSTALL_GUIDES, INSTALL_PLATFORMS, detectPlatform, iosOutsideSafari, parsePlatform } from "./install";

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/130 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130 Safari/537.36",
};

describe("detectPlatform", () => {
  it("recognises each device", () => {
    expect(detectPlatform(UA.android)).toBe("android");
    expect(detectPlatform(UA.iphone)).toBe("ios");
    expect(detectPlatform(UA.mac)).toBe("mac");
    expect(detectPlatform(UA.windows)).toBe("windows");
    expect(detectPlatform(UA.linux)).toBe("linux");
    expect(detectPlatform(UA.chromebook)).toBe("linux");
  });
  it("treats a Mac with touch as an iPad", () => {
    expect(detectPlatform(UA.mac, 5)).toBe("ios");
  });
  it("falls back to Windows for unknown browsers", () => {
    expect(detectPlatform("SomeBot/1.0")).toBe("windows");
  });
});

describe("parsePlatform", () => {
  it("accepts known devices, case and spaces aside", () => {
    expect(parsePlatform(" Android ")).toBe("android");
    expect(parsePlatform("ios")).toBe("ios");
  });
  it("rejects anything else", () => {
    expect(parsePlatform("blackberry")).toBeNull();
    expect(parsePlatform(null)).toBeNull();
    expect(parsePlatform(undefined)).toBeNull();
  });
});

describe("iosOutsideSafari", () => {
  it("flags Chrome on iPhone but not Safari or other phones", () => {
    expect(iosOutsideSafari(UA.iphoneChrome)).toBe(true);
    expect(iosOutsideSafari(UA.iphone)).toBe(false);
    expect(iosOutsideSafari(UA.android)).toBe(false);
  });
});

describe("INSTALL_GUIDES", () => {
  it("has steps for every device", () => {
    for (const p of INSTALL_PLATFORMS) {
      expect(INSTALL_GUIDES[p].steps.length).toBeGreaterThan(1);
      expect(INSTALL_GUIDES[p].label).toBeTruthy();
    }
  });
});
