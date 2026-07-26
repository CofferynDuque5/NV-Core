import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { getWorkspaceBySlug, type BillingStatus } from "@nv/domain";
import { IsOptional, IsString, IsUrl } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { StripeClient } from "./stripe.client";
import {
  extractSubscriptionUpdate,
  verifyStripeSignature,
  type StripeWebhookEvent,
} from "./stripe.webhook";

export class CheckoutDto {
  @IsOptional() @IsString() priceId?: string;
  @IsUrl({ require_tld: false }) successUrl!: string;
  @IsUrl({ require_tld: false }) cancelUrl!: string;
}

export class PortalDto {
  @IsUrl({ require_tld: false }) returnUrl!: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: StripeClient | null;
  private readonly defaultPriceId?: string;
  private readonly webhookSecret?: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    const stripeCfg = config.get("integrations", { infer: true }).stripe;
    this.stripe = stripeCfg.secretKey ? new StripeClient(stripeCfg.secretKey) : null;
    this.defaultPriceId = stripeCfg.priceId;
    this.webhookSecret = stripeCfg.webhookSecret;
  }

  private requireStripe(): StripeClient {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        "Facturación no configurada. Define STRIPE_SECRET_KEY.",
      );
    }
    return this.stripe;
  }

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async status(workspaceId: string): Promise<BillingStatus> {
    const account = this.prisma.enabled
      ? await this.prisma.billingAccount.findUnique({ where: { workspaceSlug: workspaceId } })
      : null;
    return {
      configured: Boolean(this.stripe),
      customer: Boolean(account?.stripeCustomerId),
      subscriptionStatus: account?.subscriptionStatus ?? null,
      priceId: account?.priceId ?? null,
    };
  }

  /** Ensure the workspace has a Stripe customer, creating and persisting one. */
  private async ensureCustomer(workspaceId: string): Promise<string> {
    const stripe = this.requireStripe();
    const existing = await this.db().billingAccount.findUnique({
      where: { workspaceSlug: workspaceId },
    });
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const workspace = getWorkspaceBySlug(workspaceId);
    const customer = await stripe.createCustomer({
      name: workspace?.name ?? workspaceId,
      metadata: { workspaceSlug: workspaceId },
    });
    await this.db().billingAccount.upsert({
      where: { workspaceSlug: workspaceId },
      create: { workspaceSlug: workspaceId, stripeCustomerId: customer.id },
      update: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  async checkout(workspaceId: string, dto: CheckoutDto): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const priceId = dto.priceId ?? this.defaultPriceId;
    if (!priceId) {
      throw new ServiceUnavailableException(
        "No hay un precio configurado. Define STRIPE_PRICE_ID o envía priceId.",
      );
    }
    const customer = await this.ensureCustomer(workspaceId);
    const session = await stripe.createCheckoutSession({
      customer,
      priceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });
    if (!session.url) throw new ServiceUnavailableException("Stripe no devolvió una URL de checkout.");
    return { url: session.url };
  }

  async portalUrl(workspaceId: string, returnUrl: string): Promise<string | null> {
    const stripe = this.requireStripe();
    const account = this.prisma.enabled
      ? await this.prisma.billingAccount.findUnique({ where: { workspaceSlug: workspaceId } })
      : null;
    if (!account?.stripeCustomerId) return null;
    const session = await stripe.createPortalSession({
      customer: account.stripeCustomerId,
      returnUrl,
    });
    return session.url;
  }

  /**
   * Verify and apply a Stripe webhook. Keeps BillingAccount in sync with the
   * real subscription lifecycle (checkout completed, subscription updated/cancelled).
   */
  async handleWebhook(rawBody: string, signature: string | undefined): Promise<{ received: true }> {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException("Webhook no configurado. Define STRIPE_WEBHOOK_SECRET.");
    }
    if (!verifyStripeSignature(rawBody, signature, this.webhookSecret)) {
      throw new BadRequestException("Firma de webhook inválida.");
    }

    let event: StripeWebhookEvent;
    try {
      event = JSON.parse(rawBody) as StripeWebhookEvent;
    } catch {
      throw new BadRequestException("Cuerpo del webhook no es JSON válido.");
    }

    const update = extractSubscriptionUpdate(event);
    if (update && this.prisma.enabled) {
      const account = await this.prisma.billingAccount.findFirst({
        where: { stripeCustomerId: update.customerId },
      });
      if (account) {
        await this.prisma.billingAccount.update({
          where: { id: account.id },
          data: {
            subscriptionId: update.subscriptionId ?? account.subscriptionId,
            subscriptionStatus: update.status ?? account.subscriptionStatus,
            // checkout.session.completed carries no price; keep the stored one.
            priceId: update.priceId ?? account.priceId,
          },
        });
        this.logger.log(`Stripe ${event.type} → ${account.workspaceSlug} (${update.status})`);
      } else {
        this.logger.warn(`Stripe ${event.type}: no account for customer ${update.customerId}`);
      }
    }
    return { received: true };
  }
}

@ApiTags("billing")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/billing")
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.service.status(workspaceId);
  }

  @Post("checkout")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  checkout(@WorkspaceId() workspaceId: string, @Body() dto: CheckoutDto) {
    return this.service.checkout(workspaceId, dto);
  }

  @Post("portal")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  async portal(@WorkspaceId() workspaceId: string, @Body() dto: PortalDto) {
    return { url: await this.service.portalUrl(workspaceId, dto.returnUrl) };
  }
}

/** Public Stripe webhook. Register {API_URL}/api/integrations/stripe/webhook in Stripe. */
@ApiTags("billing")
@Controller("integrations/stripe")
export class StripeWebhookController {
  constructor(private readonly service: BillingService) {}

  @Public()
  @SkipThrottle()
  @Post("webhook")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers("stripe-signature") signature?: string,
  ) {
    if (!req.rawBody) throw new BadRequestException("Falta el cuerpo sin procesar (rawBody).");
    return this.service.handleWebhook(req.rawBody.toString("utf8"), signature);
  }
}

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService],
})
export class BillingModule {}
