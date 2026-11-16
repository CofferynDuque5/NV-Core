import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PAYMENT_METHOD_CATALOG, isQrImage } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { sniffReceipt } from "../../common/receipts/receipt-store.service";

/** One method in plan-methods.json. */
export interface PlanMethodSeed {
  kind: string;
  label?: string;
  currency?: string;
  details: Record<string, string>;
  instructions?: string;
  /** Picture of the method's QR, next to plan-methods.json (e.g. "zinli-qr.jpg"). */
  qrFile?: string;
}

export type ParsedPlanMethod = Required<Omit<PlanMethodSeed, "instructions" | "qrFile">> & {
  instructions?: string;
};

/** A QR picture file as a data URL, or null when it isn't a PNG/JPEG/WebP image. */
export function qrFromFile(file: string): string | null {
  try {
    const buf = readFileSync(file);
    const type = sniffReceipt(buf);
    if (!type || type === "application/pdf") return null;
    const url = `data:${type};base64,${buf.toString("base64")}`;
    return isQrImage(url) ? url : null;
  } catch {
    return null;
  }
}

/** Valid entries of a plan-methods.json file (unknown kinds and empty ones are dropped). */
export function parsePlanMethods(
  raw: unknown,
  readQr: (file: string) => string | null = () => null,
): ParsedPlanMethod[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ParsedPlanMethod[] = [];
  for (const item of list as PlanMethodSeed[]) {
    const def = PAYMENT_METHOD_CATALOG.find((d) => d.kind === item?.kind);
    if (!def || !item.details || typeof item.details !== "object") continue;
    const details = Object.fromEntries(
      Object.entries(item.details)
        .filter(
          ([k, v]) =>
            def.fields.some((f) => f.key === k && f.type !== "image") &&
            typeof v === "string" &&
            v.trim(),
        )
        .map(([k, v]) => [k, v.trim()]),
    );
    const qrField = def.fields.find((f) => f.type === "image");
    // Only a plain file name: the picture must sit next to plan-methods.json.
    if (
      qrField &&
      typeof item.qrFile === "string" &&
      /^[\w.-]+\.(png|jpe?g|webp)$/i.test(item.qrFile)
    ) {
      const qr = readQr(item.qrFile);
      if (qr) details[qrField.key] = qr;
    }
    if (Object.keys(details).length === 0) continue;
    out.push({
      kind: def.kind,
      label: item.label?.trim() || def.label,
      currency: item.currency?.trim() || def.currency,
      details,
      ...(item.instructions?.trim() ? { instructions: item.instructions.trim() } : {}),
    });
  }
  return out;
}

/**
 * Loads the methods customers use to pay for the panel into the operator
 * brand (NV_BILLING_WORKSPACE) from a plan-methods.json file next to the app.
 * The file lives only on the server — never in the repository — and a method
 * of a kind the brand already has is left alone, so edits made in Cobros win.
 */
@Injectable()
export class PlanMethodsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlanMethodsSeeder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap(): void {
    void this.seed().catch((err: unknown) =>
      this.logger.warn(
        `No se pudieron cargar los métodos de pago del panel: ${(err as Error).message}`,
      ),
    );
  }

  async seed(
    file = process.env.PLAN_METHODS_FILE || path.resolve(process.cwd(), "plan-methods.json"),
  ): Promise<number> {
    const workspace = this.config.get("billing", { infer: true }).operatorWorkspace;
    if (!this.prisma.enabled || !workspace || !existsSync(file)) return 0;
    if (!(await this.prisma.workspace.findUnique({ where: { slug: workspace } }))) {
      this.logger.warn(
        `plan-methods.json: la marca "${workspace}" (NV_BILLING_WORKSPACE) no existe todavía.`,
      );
      return 0;
    }
    const dir = path.dirname(file);
    const methods = parsePlanMethods(JSON.parse(readFileSync(file, "utf8")), (name) =>
      qrFromFile(path.join(dir, name)),
    );
    const existing = await this.prisma.paymentMethod.findMany({
      where: { workspaceSlug: workspace },
      select: { id: true, kind: true, details: true },
    });
    let added = 0;
    for (const m of methods) {
      const same = existing.find((e) => e.kind === m.kind);
      if (same) {
        // Fill in only what the method doesn't have yet (a new QR, a new
        // e-mail); anything already set, including edits in Cobros, wins.
        const current = (same.details ?? {}) as Record<string, string>;
        const missing = Object.fromEntries(Object.entries(m.details).filter(([k]) => !current[k]));
        if (Object.keys(missing).length > 0) {
          await this.prisma.paymentMethod.update({
            where: { id: same.id },
            data: { details: { ...current, ...missing } },
          });
          added += 1;
        }
        continue;
      }
      await this.prisma.paymentMethod.create({
        data: {
          workspaceSlug: workspace,
          kind: m.kind,
          label: m.label,
          currency: m.currency,
          details: m.details,
          instructions: m.instructions ?? null,
        },
      });
      added += 1;
    }
    if (added)
      this.logger.log(
        `Métodos de pago del panel cargados o completados en "${workspace}": ${added}.`,
      );
    return added;
  }
}
