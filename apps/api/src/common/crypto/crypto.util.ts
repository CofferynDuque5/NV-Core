import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

/** Derive a stable 32-byte key from any secret string. */
export function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Output: `v1.<iv>.<tag>.<ct>` (base64
 * parts). Each call uses a fresh IV. Pure — unit tested.
 */
export function encryptString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

/** True when a value looks like our encrypted envelope. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}.`);
}

/**
 * Decrypt a value produced by {@link encryptString}. Legacy plaintext (without
 * the version prefix) is returned unchanged for backward compatibility.
 * Throws if an encrypted envelope is malformed or fails authentication.
 */
export function decryptString(value: string, key: Buffer): string {
  if (!isEncrypted(value)) return value;
  const [, ivB64, tagB64, ctB64] = value.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Envelope cifrado inválido.");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
