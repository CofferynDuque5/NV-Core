import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PAYMENT_METHOD_CATALOG } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";

/** One method in plan-methods.json. */
export interface PlanMethodSeed {
  kind: string;
  label?: string;
  currency?: string;
  details: Record<string, string>;
  instructions?: string;
}

export type ParsedPlanMethod = Required<Omit<PlanMethodSeed, "instructions">> & { instructions?: string };

/** Valid entries of a plan-methods.json file (unknown kinds and empty ones are dropped). */
export function parsePlanMethods(raw: unknown): ParsedPlanMethod[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ParsedPlanMethod[] = [];
  for (const item of list as PlanMethodSeed[]) {
    const def = PAYMENT_METHOD_CATALOG.find((d) => d.kind === item?.kind);
    if (!def || !item.details || typeof item.details !== "object") continue;
    const details = Object.fromEntries(
      Object.entries(item.details)
        .filter(([k, v]) => def.fields.some((f) => f.key === k) && typeof v === "string" && v.trim())
        .map(([k, v]) => [k, v.trim()]),
    );
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
      this.logger.warn(`No se pudieron cargar los métodos de pago del panel: ${(err as Error).message}`),
    );
  }

  async seed(file = process.env.PLAN_METHODS_FILE || path.resolve(process.cwd(), "plan-methods.json")): Promise<number> {
    const workspace = this.config.get("billing", { infer: true }).operatorWorkspace;
    if (!this.prisma.enabled || !workspace || !existsSync(file)) return 0;
    if (!(await this.prisma.workspace.findUnique({ where: { slug: workspace } }))) {
      this.logger.warn(`plan-methods.json: la marca "${workspace}" (NV_BILLING_WORKSPACE) no existe todavía.`);
      return 0;
    }
    const methods = parsePlanMethods(JSON.parse(readFileSync(file, "utf8")));
    const existing = await this.prisma.paymentMethod.findMany({ where: { workspaceSlug: workspace }, select: { kind: true } });
    let added = 0;
    for (const m of methods) {
      if (existing.some((e) => e.kind === m.kind)) continue;
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
    if (added) this.logger.log(`Métodos de pago del panel cargados en "${workspace}": ${added}.`);
    return added;
  }
}
