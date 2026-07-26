import { createHash, randomBytes } from "node:crypto";

/** Opaque, high-entropy refresh token (sent to the client in an httpOnly cookie). */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

/** SHA-256 of the token — only the hash is stored server-side. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
