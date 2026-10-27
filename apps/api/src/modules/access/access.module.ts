import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import type { AccessOverview, AccessPayment, PaymentCurrency, PaymentStatus } from "@nv/domain";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

export class AccessPaymentDto {
  @IsString() @MinLength(1) methodId!: string;
  @IsString() @MinLength(3) @MaxLength(120) reference!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
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
  ) {}

  private get billing() {
    return this.config.get("billing", { infer: true });
  }

  async overview(workspaceId: string): Promise<AccessOverview> {
    const state = await this.access.state(workspaceId);
    const { plan, operatorWorkspace } = this.billing;
    if (state.state === "unlimited" || !this.prisma.enabled || !operatorWorkspace) {
      return { ...state, plan, methods: [] };
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
          status: last.status as PaymentStatus,
          amount: Number(last.amount),
          currency: last.currency as PaymentCurrency,
          methodLabel: last.methodLabel ?? undefined,
          reference: last.reference ?? undefined,
          rejectReason: last.rejectReason ?? undefined,
          createdAt: last.createdAt.toISOString(),
        }
      : undefined;
    return { ...state, plan, methods: methods.map(mapMethod), ...(payment ? { payment } : {}) };
  }

  async pay(workspaceId: string, actor: string, dto: AccessPaymentDto): Promise<AccessOverview> {
    const operator = this.billing.operatorWorkspace;
    const state = await this.access.state(workspaceId);
    if (state.state === "unlimited") throw new BadRequestException("Esta marca no necesita plan.");
    if (!operator) throw new BadRequestException("El pago del plan aún no está configurado. Escríbenos para activarlo.");
    const ws = await this.registry.resolve(workspaceId);
    await this.payments.submitPlanPayment(operator, workspaceId, ws?.name ?? workspaceId, actor, dto);
    return this.overview(workspaceId);
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

  // Paying for the brand is an Owner/Admin decision.
  @Post("pay")
  @HttpCode(200)
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  pay(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: AccessPaymentDto) {
    return this.service.pay(workspaceId, user.email, dto);
  }
}

@Module({ imports: [PaymentsModule], controllers: [AccessController], providers: [AccessService] })
export class AccessModule {}
