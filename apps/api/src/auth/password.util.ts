import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEYLEN = 64;

/**
 * A well-formed hash that no password matches. Verify against this when the
 * account doesn't exist so login runs the same scrypt work either way,
 * removing the timing oracle that would otherwise reveal which emails exist.
 */
export const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(KEYLEN * 2)}`;

/**
 * Password hashing with Node's built-in scrypt — no native/compiled deps.
 * Format stored: `<saltHex>:<hashHex>`.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(plain, salt, KEYLEN)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
