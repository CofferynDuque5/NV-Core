import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  SALES_PLANS,
  salesPlanId,
  type AccessOverview,
  type AccessPayment,
  type AccessPlanOption,
  type PaymentCurrency,
  type PaymentStatus,
  type SalesPlanId,
  RECEIPT_MAX_BYTES,
} from "@nv/domain";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { WorkspaceAccessService } from "../../common/access/workspace-access.service";
import { WorkspaceRegistry } from "../../common/workspace-registry.service";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PaymentsModule, PaymentsService, mapMethod } from "../payments/payments.module";
import { UsdtRateService } from "../../common/fx/usdt-rate.service";

export class AccessPaymentDto {
  @ApiPropertyOptional({ enum: ["basico", "pro"] }) @IsOptional() @IsIn(["basico", "pro"]) planId?: SalesPlanId;
  @IsString() @MinLength(1) @MaxLength(64) methodId!: string;
  @IsString() @MinLength(3) @MaxLength(120) reference!: string;
  /** Payer details as JSON (sent in a multipart form with the receipt). */
  @IsString() @MaxLength(4000) payer!: string;
}

/** The payer JSON of the form, as a flat object (anything else is refused). */
export function parsePayer(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BadRequestException("Los datos del pago no son válidos.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Los datos del pago no son válidos.");
  return value as Record<string, unknown>;
}

/**
 * What a customer brand sees about its free trial and plan: its state, the
 * price, where to pay (the operator brand's active Cobros methods) and its
 * last plan payment. Routes under `access` stay open after the trial ends.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly access: WorkspaceAccessService,
    private readonly registry: WorkspaceRegistry,
    private readonly payments: PaymentsService,
    private readonly rates: UsdtRateService,
  ) {}

  private get billing() {
    return this.config.get("billing", { infer: true });
  }

  /** Every plan with the operator's price, cheapest first. */
  private plans(): AccessPlanOption[] {
    const { plan, basicPrice } = this.billing;
    return [
      { id: "basico", price: basicPrice, currency: plan.currency, days: plan.days },
      { id: "pro", ...plan },
    ];
  }

  async overview(workspaceId: string): Promise<AccessOverview> {
    const state = await this.access.state(workspaceId);
    const planId = await this.access.planId(workspaceId);
    const { plan, operatorWorkspace } = this.billing;
    const trial = await this.access.trialInfo(workspaceId);
    const base = {
      ...state,
      plan,
      plans: this.plans(),
      ...(planId ? { planId } : {}),
      ...(trial.trialSendUsed ? { trialSendUsed: true } : {}),
      ...(trial.trialDenied ? { trialDenied: true } : {}),
    };
    if (state.state === "unlimited" || !this.prisma.enabled || !operatorWorkspace) {
      return { ...base, methods: [] };
    }
    const [methods, last] = await Promise.all([
      this.prisma.paymentMethod.findMany({
        where: { workspaceSlug: operatorWorkspace, active: true },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
      this.prisma.paymentRequest.findFirst({
        where: { workspaceSlug: operatorWorkspace, forWorkspace: workspaceId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const payment: AccessPayment | undefined = last
      ? {
          id: last.id,
          ...(salesPlanId(last.planId) ? { planId: salesPlanId(last.planId) } : {}),
          status: last.status as PaymentStatus,
          amount: Number(last.amount),
          currency: last.currency as PaymentCurrency,
          methodLabel: last.methodLabel ?? undefined,
          reference: last.reference ?? undefined,
          rejectReason: last.rejectReason ?? undefined,
          ...(last.localAmount != null ? { localAmount: Number(last.localAmount), localCurrency: last.localCurrency ?? undefined } : {}),
          createdAt: last.createdAt.toISOString(),
        }
      : undefined;
    const vesRate = methods.some((m) => m.currency === "VES") ? await this.rates.current() : null;
    return {
      ...base,
      methods: methods.map(mapMethod),
      ...(payment ? { payment } : {}),
      ...(vesRate ? { vesRate } : {}),
    };
  }

  async pay(workspaceId: string, actor: string, dto: AccessPaymentDto, receipt?: Buffer): Promise<AccessOverview> {
    const operator = this.billing.operatorWorkspace;
    const state = await this.access.state(workspaceId);
    if (state.state === "unlimited") throw new BadRequestException("Esta marca no necesita plan.");
    if (!operator) throw new BadRequestException("El pago del plan aún no está configurado. Escríbenos para activarlo.");
    const planId = dto.planId ?? "pro";
    if (planId === "basico") await this.assertFitsBasic(workspaceId);
    const ws = await this.registry.resolve(workspaceId);
    if (!receipt?.length) throw new BadRequestException("Adjunta el comprobante del pago (foto, captura o PDF).");
    await this.payments.submitPlanPayment(
      operator,
      workspaceId,
      ws?.name ?? workspaceId,
      actor,
      { methodId: dto.methodId, reference: dto.reference, payer: parsePayer(dto.payer) },
      planId,
      receipt,
    );
    return this.overview(workspaceId);
  }

  /**
   * Básico is one brand with one WhatsApp number: refuse it up front (before
   * anyone pays) when the account already uses more than that.
   */
  private async assertFitsBasic(workspaceId: string): Promise<void> {
    const limits = SALES_PLANS.basico.limits;
    const extraLines = await this.prisma.whatsappSession.count({ where: { workspaceSlug: workspaceId, line: { gt: limits.whatsappNumbers } } });
    if (extraLines > 0) {
      throw new BadRequestException(
        `El plan Básico incluye ${limits.whatsappNumbers} número de WhatsApp y esta marca tiene más. Elige Pro, o quita los números extra en Conexiones.`,
      );
    }
    const owners = await this.prisma.membership.findMany({ where: { workspaceSlug: workspaceId, role: "Owner" }, select: { userId: true } });
    if (owners.length === 0 || limits.brands == null) return;
    const owned = await this.prisma.membership.findMany({
      where: { userId: { in: owners.map((o) => o.userId) }, role: "Owner" },
      select: { workspaceSlug: true },
    });
    const slugs = [...new Set(owned.map((m) => m.workspaceSlug))];
    const brands = await this.prisma.workspaceAccess.count({ where: { workspaceSlug: { in: slugs } } });
    if (brands > limits.brands) {
      throw new BadRequestException(
        `El plan Básico incluye ${limits.brands} marca y tu cuenta tiene ${brands}. Elige Pro, o elimina las marcas que no uses.`,
      );
    }
  }
}

@ApiTags("access")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/access")
export class AccessController {
  constructor(private readonly service: AccessService) {}

  @Get()
  overview(@WorkspaceId() workspaceId: string) {
    return this.service.overview(workspaceId);
  }

  // Paying for the brand is an Owner/Admin decision. A multipart form with
  // the receipt (multer's default memory storage: never written as sent;
  // max 5 MB, one file) and the payer details.
  @Post("pay")
  @HttpCode(200)
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("receipt", { limits: { fileSize: RECEIPT_MAX_BYTES, files: 1, fields: 10 } }),
  )
  pay(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AccessPaymentDto,
    @UploadedFile() receipt?: { buffer?: Buffer },
  ) {
    return this.service.pay(workspaceId, user.email, dto, receipt?.buffer);
  }
}

@Module({ imports: [PaymentsModule], controllers: [AccessController], providers: [AccessService] })
export class AccessModule {}
