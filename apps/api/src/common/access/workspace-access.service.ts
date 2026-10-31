import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { planIncludes, type PlanFeature, type SalesPlanId, type SalesPlanLimits, type WorkspaceAccess } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { accessState, effectivePlan, extendPaidUntil, planLimits, type AccessRow } from "./workspace-access";

/** How long a brand's access is remembered between requests. */
const CACHE_MS = 30_000;

/** Where a new brand's owner comes from (to give one free trial per person and device). */
export interface TrialOrigin {
  userId: string;
  /** Random id the browser keeps (localStorage + cookie). */
  deviceId?: string;
  /** Hash of the browser's traits (screen, time zone, GPU…), computed in the browser. */
  fingerprint?: string;
  ip?: string | null;
}

const DEVICE_RE = /^[A-Za-z0-9_-]{16,128}$/;
/** How long "same browser traits + same IP" blocks a new trial. */
export const FINGERPRINT_WINDOW_MS = 7 * 86_400_000;
const hash = (v: string) => createHash("sha256").update(`nv-trial:${v}`).digest("hex");

/** Hashed, validated keys of a trial origin (junk header values are ignored). */
export function trialKeys(origin: TrialOrigin): { deviceHash: string | null; fingerprintHash: string | null; ip: string | null } {
  return {
    deviceHash: origin.deviceId && DEVICE_RE.test(origin.deviceId) ? hash(origin.deviceId) : null,
    fingerprintHash: origin.fingerprint && DEVICE_RE.test(origin.fingerprint) ? hash(origin.fingerprint) : null,
    ip: origin.ip?.trim().slice(0, 64) || null,
  };
}

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

  /**
   * Start the trial of a brand a customer just created (no-op when trials are
   * off). One trial per account and per device: when the owner, the browser
   * id, or the same browser traits from the same IP already got one, the
   * brand starts with its trial already over (it shows how to pay).
   */
  async startTrial(workspaceSlug: string, origin?: TrialOrigin, now = new Date()): Promise<{ denied: boolean }> {
    if (!this.prisma.enabled || this.trialHours <= 0) return { denied: false };
    const keys = origin ? trialKeys(origin) : null;
    let denied = false;
    if (origin && keys) {
      const or: Record<string, unknown>[] = [{ userId: origin.userId }];
      if (keys.deviceHash) or.push({ deviceHash: keys.deviceHash });
      // Same traits from the same IP only counts for a week: many people share
      // a public IP (mobile carriers) and identical phones look alike.
      if (keys.fingerprintHash && keys.ip && this.config.get("billing", { infer: true }).fingerprintCheck !== false) {
        or.push({ fingerprintHash: keys.fingerprintHash, ip: keys.ip, createdAt: { gte: new Date(now.getTime() - FINGERPRINT_WINDOW_MS) } });
      }
      const prior = await this.prisma.trialClaim.findFirst({ where: { OR: or, brandSlug: { not: workspaceSlug } }, select: { id: true } });
      denied = !!prior;
    }
    await this.prisma.workspaceAccess.upsert({
      where: { workspaceSlug },
      create: {
        workspaceSlug,
        trialEndsAt: denied ? now : new Date(now.getTime() + this.trialHours * 3_600_000),
        trialDenied: denied,
      },
      update: {},
    });
    if (origin && keys) {
      await this.prisma.trialClaim.create({ data: { brandSlug: workspaceSlug, userId: origin.userId, ...keys, granted: !denied } });
    }
    this.cache.delete(workspaceSlug);
    return { denied };
  }

  /** Whether the brand's plan opens that module (brands without a plan open everything). */
  async allows(workspaceSlug: string, feature: PlanFeature, now = new Date()): Promise<boolean> {
    const plan = effectivePlan(await this.row(workspaceSlug), now);
    return !plan || planIncludes(plan, feature);
  }

  /** Trial details for the panel: whether its one send was used, or it was never given. */
  async trialInfo(workspaceSlug: string): Promise<{ trialSendUsed: boolean; trialDenied: boolean }> {
    if (!this.prisma.enabled) return { trialSendUsed: false, trialDenied: false };
    const row = await this.prisma.workspaceAccess.findUnique({
      where: { workspaceSlug },
      select: { trialSendAt: true, trialDenied: true },
    });
    return { trialSendUsed: !!row?.trialSendAt, trialDenied: !!row?.trialDenied };
  }

  /**
   * Take the trial's one campaign send. "free" = the brand is not on a trial
   * (paid or unlimited: no limit); "claimed" = this run is the trial's send;
   * "used" = it was already taken.
   */
  async claimTrialSend(workspaceSlug: string, now = new Date()): Promise<"free" | "claimed" | "used"> {
    if (!this.prisma.enabled) return "free";
    const state = accessState(await this.freshRow(workspaceSlug), now).state;
    if (state !== "trial") return "free";
    const claim = await this.prisma.workspaceAccess.updateMany({
      where: { workspaceSlug, trialSendAt: null },
      data: { trialSendAt: now },
    });
    return claim.count === 1 ? "claimed" : "used";
  }

  /** Whether the trial's send is already taken (without taking it). */
  async trialSendTaken(workspaceSlug: string, now = new Date()): Promise<boolean> {
    if (!this.prisma.enabled) return false;
    const row = await this.prisma.workspaceAccess.findUnique({
      where: { workspaceSlug },
      select: { trialEndsAt: true, paidUntil: true, planId: true, trialSendAt: true },
    });
    return !!row && accessState(row, now).state === "trial" && !!row.trialSendAt;
  }

  /** Close the trial now (after its one send): the panel then asks to pay. */
  async endTrial(workspaceSlug: string, now = new Date()): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.workspaceAccess.updateMany({
      where: { workspaceSlug, trialEndsAt: { gt: now }, OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] },
      data: { trialEndsAt: now },
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

  private async freshRow(workspaceSlug: string): Promise<AccessRow | null> {
    this.cache.delete(workspaceSlug);
    return this.row(workspaceSlug);
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
