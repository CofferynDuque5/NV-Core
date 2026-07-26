import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { decryptString, deriveKey, encryptString, isEncrypted } from "./crypto.util";

/**
 * App-wide symmetric encryption for secrets at rest (OAuth tokens, API keys).
 * The key is derived from `security.encryptionKey` (see configuration.ts, which
 * requires it in production and provides a dev fallback).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    this.key = deriveKey(config.get("security", { infer: true }).encryptionKey);
  }

  encrypt(plaintext: string): string {
    return encryptString(plaintext, this.key);
  }

  decrypt(value: string): string {
    return decryptString(value, this.key);
  }

  /** Encrypt only if a value is present (helper for optional fields). */
  encryptNullable(value: string | null | undefined): string | null {
    return value ? this.encrypt(value) : null;
  }

  isEncrypted(value: string): boolean {
    return isEncrypted(value);
  }
}
