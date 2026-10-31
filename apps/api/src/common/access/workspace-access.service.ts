import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SalesPlanId, SalesPlanLimits, WorkspaceAccess } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { accessState, effectivePlan, extendPaidUntil, planLimits, type AccessRow } from "./workspace-access";

/** How long a brand's access is remembered between requests. */
const CACHE_MS = 30_000;

/**
 * Free trial and paid time of customer-created brands. The tenant guard asks
 * it on every brand request, so rows are cached briefly; a change made here
 * (activation) clears the cache at once.
 */
@Injectable()
export class WorkspaceAccessService {
  private readonly cache = new Map<string, { row: AccessRow | null; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get trialHours(): number {
    return this.config.get("billing", { infer: true }).trialHours;
  }

  /** Start the trial of a brand a customer just created (no-op when trials are off). */
  async startTrial(workspaceSlug: string, now = new Date()): Promise<void> {
    if (!this.prisma.enabled || this.trialHours <= 0) return;
    await this.prisma.workspaceAccess.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, trialEndsAt: new Date(now.getTime() + this.trialHours * 3_600_000) },
      update: {},
    });
    this.cache.delete(workspaceSlug);
  }

  async state(workspaceSlug: string, now = new Date()): Promise<WorkspaceAccess> {
    return accessState(await this.row(workspaceSlug), now);
  }

  /** Plan in force for the brand (undefined = no plan needed). */
  async planId(workspaceSlug: string, now = new Date()): Promise<SalesPlanId | undefined> {
    return effectivePlan(await this.row(workspaceSlug), now);
  }

  /** Limits of the brand's plan (undefined = unlimited). */
  async limits(workspaceSlug: string, now = new Date()): Promise<SalesPlanLimits | undefined> {
    return planLimits(await this.row(workspaceSlug), now);
  }

  /**
   * Add paid days to a brand (from today if it had run out). With `planId`
   * the brand moves to that plan; without it, it keeps the one it had.
   */
  async activate(
    workspaceSlug: string,
    days: number,
    actor: string,
    now = new Date(),
    planId?: SalesPlanId,
  ): Promise<WorkspaceAccess> {
    const current = await this.prisma.workspaceAccess.findUnique({ where: { workspaceSlug } });
    // Paying during the trial keeps its remaining hours: the paid days start after them.
    const paidUntil = extendPaidUntil(current?.paidUntil ?? current?.trialEndsAt ?? null, days, now);
    const row = await this.prisma.workspaceAccess.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, trialEndsAt: now, paidUntil, activatedBy: actor, ...(planId ? { planId } : {}) },
      update: { paidUntil, activatedBy: actor, ...(planId ? { planId } : {}) },
    });
    this.cache.delete(workspaceSlug);
    return accessState(row, now);
  }

  /** Every brand on a trial or paid plan, newest first (for the operator). */
  async list(
    now = new Date(),
  ): Promise<(WorkspaceAccess & { workspaceSlug: string; createdAt: string; planId?: SalesPlanId })[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.workspaceAccess.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    return rows.map((r) => ({
      workspaceSlug: r.workspaceSlug,
      createdAt: r.createdAt.toISOString(),
      ...accessState(r, now),
      planId: effectivePlan(r, now),
    }));
  }

  private async row(workspaceSlug: string): Promise<AccessRow | null> {
    if (!this.prisma.enabled) return null;
    const hit = this.cache.get(workspaceSlug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;
    const row = await this.prisma.workspaceAccess.findUnique({
      where: { workspaceSlug },
      select: { trialEndsAt: true, paidUntil: true, planId: true },
    });
    this.cache.set(workspaceSlug, { row, at: Date.now() });
    return row;
  }
}
