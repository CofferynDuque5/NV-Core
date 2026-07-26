import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.util";

describe("password.util", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces a salted hash (different each time)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(a).toContain(":");
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});
