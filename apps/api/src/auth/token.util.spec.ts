import { describe, expect, it } from "vitest";

import { generateRefreshToken, hashToken } from "./token.util";

describe("token.util", () => {
  it("generates unique, high-entropy tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
  });

  it("hashes deterministically and irreversibly", () => {
    const token = "abc123";
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64); // sha256 hex
  });
});
