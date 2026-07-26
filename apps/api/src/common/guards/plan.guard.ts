import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { REQUIRES_PLAN } from "../decorators/requires-plan.decorator";

const ACTIVE_STATUSES = ["active", "trialing"];

/**
 * Gates premium routes behind an active subscription. Transparent when billing
 * is not configured (no STRIPE_SECRET_KEY) so the app is fully usable without
 * Stripe; once billing is on, premium routes need an active subscription.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRES_PLAN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    // Billing off → don't gate anything.
    if (!this.config.get("integrations", { infer: true }).stripe.secretKey) return true;
    if (!this.prisma.enabled) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ params: { workspace?: string } }>();
    const slug = request.params.workspace;
    if (!slug) return true;

    const account = await this.prisma.billingAccount.findUnique({
      where: { workspaceSlug: slug },
    });
    const active =
      account?.subscriptionStatus && ACTIVE_STATUSES.includes(account.subscriptionStatus);
    if (!active) {
      throw new HttpException(
        "Esta función requiere una suscripción activa. Actívala en Configuración → Facturación.",
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
