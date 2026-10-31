import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RECEIPT_MAX_BYTES } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";

type ReceiptType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const EXT: Record<ReceiptType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const BY_EXT: Record<string, ReceiptType> = Object.fromEntries(
  Object.entries(EXT).map(([type, ext]) => [ext, type as ReceiptType]),
);

/** Stored names are random and fixed-shape, so a name can never point outside the folder. */
export const RECEIPT_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/;

const at = (b: Buffer, bytes: number[], offset = 0) =>
  b.length >= offset + bytes.length && bytes.every((x, i) => b[offset + i] === x);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/**
 * The receipt's real type, from its first bytes (never from the name or the
 * type the browser claims): JPEG, PNG, WebP or PDF; anything else is refused.
 */
export function sniffReceipt(buf: Buffer): ReceiptType | undefined {
  if (at(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(buf, ascii("RIFF")) && at(buf, ascii("WEBP"), 8)) return "image/webp";
  if (at(buf, ascii("%PDF-"))) return "application/pdf";
  return undefined;
}

/**
 * Payment receipts carry personal and bank data, so they live in their own
 * folder outside the public media one and are only read back through the
 * admin (or billing-brand Owner/Admin) endpoints.
 */
@Injectable()
export class ReceiptStore {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get dir(): string {
    const dir = this.config.get("billing", { infer: true }).receiptsDir;
    return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  /** Check and keep a receipt; returns its stored name and real type. */
  async save(buf: Buffer | undefined): Promise<{ file: string; type: ReceiptType }> {
    if (!buf || buf.length === 0)
      throw new BadRequestException("Adjunta el comprobante del pago (foto, captura o PDF).");
    if (buf.length > RECEIPT_MAX_BYTES)
      throw new BadRequestException(
        "El comprobante pesa más de 5 MB. Envía una captura más liviana.",
      );
    const type = sniffReceipt(buf);
    if (!type)
      throw new BadRequestException(
        "El comprobante debe ser una imagen (JPG, PNG o WebP) o un PDF.",
      );
    const file = `${randomBytes(16).toString("hex")}.${EXT[type]}`;
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(join(this.dir, file), buf, { mode: 0o600, flag: "wx" });
    return { file, type };
  }

  async read(
    file: string | null | undefined,
  ): Promise<{ buf: Buffer; type: ReceiptType; ext: string }> {
    if (!file || !RECEIPT_NAME_RE.test(file))
      throw new NotFoundException("Este pago no tiene comprobante.");
    const ext = file.split(".").pop()!;
    try {
      return { buf: await readFile(join(this.dir, file)), type: BY_EXT[ext]!, ext };
    } catch {
      throw new NotFoundException("No se encontró el archivo del comprobante.");
    }
  }
}
