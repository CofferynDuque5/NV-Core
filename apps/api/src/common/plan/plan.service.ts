import { Global, HttpException, HttpStatus, Injectable, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getPlan, PLANS, type Plan, type PlanId, type PlanLimits } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { usagePeriod } from "../../modules/ai/ai.usage";

/** The countable, plan-limited resources. */
export type LimitedResource = keyof PlanLimits; // "contacts" | "campaigns" | "teamMembers" | "aiCallsPerMonth"

export interface PlanUsage {
  contacts: number;
  campaigns: number;
  teamMembers: number;
  aiCalls: number;
}

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing"]);

/**
 * Resolves a workspace's effective plan and enforces its limits.
 *
 * Free vs Pro: a workspace with an active Stripe subscription is Pro, otherwise
 * Free. When Stripe isn't configured at all (self-host / dev), the plan is
 * `DEFAULT_PLAN` (default "pro") so self-hosters aren't limited by accident.
 */
@Injectable()
export class PlanService {
  private readonly stripeConfigured: boolean;
  private readonly defaultPlan: PlanId;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.stripeConfigured = Boolean(config.get("integrations", { infer: true }).stripe.secretKey);
    const configured = config.get("billing", { infer: true }).defaultPlan;
    this.defaultPlan = configured === "free" ? "free" : "pro";
  }

  /** The effective plan id for a workspace. */
  async resolvePlanId(workspaceId: string): Promise<PlanId> {
    // Without Stripe there is no paid tier to gate against → operator default.
    if (!this.stripeConfigured) return this.defaultPlan;
    if (!this.prisma.enabled) return "free";
    const account = await this.prisma.billingAccount.findUnique({
      where: { workspaceSlug: workspaceId },
      select: { subscriptionStatus: true },
    });
    return account?.subscriptionStatus && ACTIVE_SUB_STATUSES.has(account.subscriptionStatus)
      ? "pro"
      : "free";
  }

  async resolvePlan(workspaceId: string): Promise<Plan> {
    return getPlan(await this.resolvePlanId(workspaceId));
  }

  /** Current usage counts for a workspace's limited resources. */
  async usage(workspaceId: string): Promise<PlanUsage> {
    if (!this.prisma.enabled) {
      return { contacts: 0, campaigns: 0, teamMembers: 0, aiCalls: 0 };
    }
    const [contacts, campaigns, teamMembers, ai] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.campaign.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.membership.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.aiUsage.findUnique({
        where: {
          workspaceSlug_period: { workspaceSlug: workspaceId, period: usagePeriod(new Date()) },
        },
        select: { calls: true },
      }),
    ]);
    return { contacts, campaigns, teamMembers, aiCalls: ai?.calls ?? 0 };
  }

  /**
   * Throw 402 when adding `count` more of `resource` would exceed the plan
   * limit. `null` limits are unlimited → no-op. Used by create/import paths.
   */
  async assertWithinLimit(
    workspaceId: string,
    resource: Exclude<LimitedResource, "aiCallsPerMonth">,
    count = 1,
  ): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = plan.limits[resource];
    if (limit == null) return; // unlimited

    const usage = await this.usage(workspaceId);
    const currentByResource: Record<typeof resource, number> = {
      contacts: usage.contacts,
      campaigns: usage.campaigns,
      teamMembers: usage.teamMembers,
    };
    const current = currentByResource[resource];
    if (current + count > limit) {
      throw new HttpException(
        `Límite del plan ${plan.name} alcanzado (${limit} ${LABELS[resource]}). Amplía tu plan para añadir más.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }
}

const LABELS: Record<"contacts" | "campaigns" | "teamMembers", string> = {
  contacts: "contactos",
  campaigns: "campañas",
  teamMembers: "miembros",
};

export { PLANS };

@Global()
@Module({ providers: [PlanService], exports: [PlanService] })
export class PlanModule {}
