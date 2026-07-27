import { describe, expect, it } from "vitest";

import { numberFromJid, toJid } from "./whatsapp.types";
import { sanitize } from "./session-manager";

describe("toJid", () => {
  it("builds a user JID from a phone number, stripping non-digits", () => {
    expect(toJid("+58 412 555 1234")).toBe("584125551234@s.whatsapp.net");
  });
  it("leaves an existing JID untouched (e.g. a group)", () => {
    expect(toJid("123456-789@g.us")).toBe("123456-789@g.us");
  });
});

describe("numberFromJid", () => {
  it("extracts the phone from a Baileys user id", () => {
    expect(numberFromJid("584125551234:12@s.whatsapp.net")).toBe("+584125551234");
  });
  it("returns null for empty input", () => {
    expect(numberFromJid(null)).toBeNull();
    expect(numberFromJid(undefined)).toBeNull();
  });
});

describe("sanitize (session dir segment)", () => {
  it("keeps safe slug characters and strips the rest", () => {
    expect(sanitize("ciclo-creativo")).toBe("ciclo-creativo");
    expect(sanitize("../../etc/passwd")).toBe("etcpasswd");
  });
  it("falls back to 'default' when empty", () => {
    expect(sanitize("///")).toBe("default");
  });
});
