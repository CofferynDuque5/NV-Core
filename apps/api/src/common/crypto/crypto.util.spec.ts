import { describe, expect, it } from "vitest";

import { decryptString, deriveKey, encryptString, isEncrypted, safeEqual } from "./crypto.util";

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    expect(safeEqual("s3cret-token", "s3cret-token")).toBe(true);
    expect(safeEqual("s3cret-token", "s3cret-toke")).toBe(false);
    expect(safeEqual("s3cret-token", "s3cret-tokeN")).toBe(false);
  });
  it("is false for length mismatch and nullish inputs", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(undefined, "abc")).toBe(false);
    expect(safeEqual("abc", null)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });
});

const key = deriveKey("test-secret");

describe("crypto.util", () => {
  it("round-trips a value", () => {
    const enc = encryptString("ya29.secret-token", key);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("ya29");
    expect(decryptString(enc, key)).toBe("ya29.secret-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptString("same", key)).not.toBe(encryptString("same", key));
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptString("secret", key);
    expect(() => decryptString(enc, deriveKey("other"))).toThrow();
  });

  it("fails authentication on tampered ciphertext", () => {
    const enc = encryptString("secret", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptString(parts.join("."), key)).toThrow();
  });

  it("returns legacy plaintext unchanged", () => {
    expect(decryptString("plain-legacy-value", key)).toBe("plain-legacy-value");
    expect(isEncrypted("plain-legacy-value")).toBe(false);
  });
});
