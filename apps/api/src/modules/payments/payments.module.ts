import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  PAYMENT_CURRENCIES,
  PAYMENT_METHOD_KINDS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSITIONS,
  PAYMENT_STATUS_LABEL,
  SALES_PLANS,
  formatPaymentAmount,
  paymentMethodDef,
  planPayerFields,
  salesPlanId,
  vesAmount,
  type PlanPaymentReview,
  type SalesPlanId,
  type PaymentCurrency,
  type PaymentMethod,
  type PaymentMethodKind,
  type PaymentRequest,
  type PaymentStatus,
} from "@nv/domain";
import { Prisma, type PaymentMethod as MethodRow, type PaymentRequest as RequestRow } from "@prisma/client";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { WorkspaceAccessService } from "../../common/access/workspace-access.service";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsModule, NotificationsService } from "../notifications/notifications.module";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PlanMethodsSeeder } from "./plan-methods.seed";
import { PlanPaymentAlerts } from "./plan-payment-alerts";
import { ReceiptStore } from "../../common/receipts/receipt-store.service";
import { UsdtRateService } from "../../common/fx/usdt-rate.service";

/** Payment requests listed at once (newest first). */
export const PAYMENTS_LIMIT = 300;
/** Methods per brand; far above real use. */
const METHODS_LIMIT = 50;
const MAX_AMOUNT = 1_000_000_000_000;

export class PaymentMethodDto {
  @IsIn(PAYMENT_METHOD_KINDS) kind!: PaymentMethodKind;
  @IsString() @MinLength(1) @MaxLength(80) label!: string;
  @IsIn(PAYMENT_CURRENCIES) currency!: PaymentCurrency;
  @IsObject() details!: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) label?: string;
  @IsOptional() @IsIn(PAYMENT_CURRENCIES) currency?: PaymentCurrency;
  @IsOptional() @IsObject() details?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreatePaymentDto {
  @IsString() @MinLength(1) @MaxLength(200) concept!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) amount!: number;
  @IsIn(PAYMENT_CURRENCIES) currency!: PaymentCurrency;
  @IsOptional() @IsString() @MaxLength(64) contactId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

const nullable = () => ValidateIf((_o, v) => v !== null && v !== undefined);

export class UpdatePaymentDto {
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: PaymentStatus;
  @ApiPropertyOptional({ nullable: true }) @nullable() @IsString() @MaxLength(64) methodId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @nullable() @IsString() @MaxLength(120) reference?: string | null;
  @ApiPropertyOptional({ nullable: true }) @nullable() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ nullable: true }) @nullable() @IsString() @MaxLength(300) rejectReason?: string | null;
  @ApiPropertyOptional({ nullable: true }) @nullable() @IsDateString() dueAt?: string | null;
}

/** Keep only the catalog fields of the kind, trimmed; require the mandatory ones. */
export function cleanDetails(kind: PaymentMethodKind, details: Record<string, unknown>): Record<string, string> {
  const def = paymentMethodDef(kind);
  const out: Record<string, string> = {};
  for (const f of def.fields) {
    const v = details[f.key];
    if (v == null) continue;
    if (typeof v !== "string") throw new BadRequestException(`«${f.label}» debe ser texto.`);
    const t = v.trim();
    if (t.length > 200) throw new BadRequestException(`«${f.label}» es demasiado largo.`);
    if (t) out[f.key] = t;
  }
  const missing = def.fields.filter((f) => f.required && !out[f.key]).map((f) => f.label);
  if (missing.length > 0) throw new BadRequestException(`Falta: ${missing.join(", ")}.`);
  return out;
}

/** Longest payer detail kept. */
const PAYER_MAX = 120;

/**
 * Keep only the payer fields this kind of method asks for, trimmed; require
 * the mandatory ones; the payment date must be real, not in the future and
 * not older than 60 days.
 */
export function cleanPayer(kind: string, payer: Record<string, unknown> | undefined, now = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  const fields = planPayerFields(kind);
  for (const f of fields) {
    const v = payer?.[f.key];
    if (v == null) continue;
    if (typeof v !== "string") throw new BadRequestException(`«${f.label}» debe ser texto.`);
    // Control characters (new lines, tabs, NUL…) become spaces.
    const t = Array.from(v, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c)).join("").trim();
    if (t.length > PAYER_MAX) throw new BadRequestException(`«${f.label}» es demasiado largo.`);
    if (t) out[f.key] = t;
  }
  const missing = fields.filter((f) => f.required && !out[f.key]).map((f) => f.label);
  if (missing.length > 0) throw new BadRequestException(`Falta: ${missing.join(", ")}.`);
  if (out.paidOn) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(out.paidOn) ? new Date(`${out.paidOn}T12:00:00Z`) : null;
    if (!day || Number.isNaN(day.getTime())) throw new BadRequestException("La fecha del pago no es válida.");
    if (day.getTime() > now.getTime() + 36 * 3_600_000) throw new BadRequestException("La fecha del pago no puede ser futura.");
    if (day.getTime() < now.getTime() - 60 * 86_400_000) throw new BadRequestException("Ese pago tiene más de 60 días: escríbenos.");
  }
  return out;
}

export function mapPlanReview(row: RequestRow): PlanPaymentReview {
  return {
    id: row.id,
    forWorkspace: row.forWorkspace ?? "",
    ...(salesPlanId(row.planId) ? { planId: salesPlanId(row.planId) } : {}),
    status: row.status as PaymentStatus,
    amount: Number(row.amount),
    currency: row.currency as PaymentCurrency,
    ...(row.localAmount != null ? { localAmount: Number(row.localAmount), localCurrency: row.localCurrency ?? undefined } : {}),
    ...(row.rate != null ? { rate: Number(row.rate) } : {}),
    methodLabel: row.methodLabel ?? undefined,
    reference: row.reference ?? undefined,
    payer: (row.payer ?? {}) as Record<string, string>,
    hasReceipt: !!row.receiptFile,
    rejectReason: row.rejectReason ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapMethod(row: MethodRow): PaymentMethod {
  return {
    id: row.id,
    kind: row.kind as PaymentMethodKind,
    label: row.label,
    currency: row.currency as PaymentCurrency,
    details: (row.details ?? {}) as Record<string, string>,
    instructions: row.instructions ?? undefined,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPayment(row: RequestRow, contactName?: string): PaymentRequest {
  const contact = row.contactId && contactName !== undefined ? { contactId: row.contactId, contactName } : {};
  return {
    id: row.id,
    concept: row.concept,
    amount: Number(row.amount),
    currency: row.currency as PaymentCurrency,
    status: row.status as PaymentStatus,
    ...contact,
    methodId: row.methodId ?? undefined,
    methodLabel: row.methodLabel ?? undefined,
    reference: row.reference ?? undefined,
    note: row.note ?? undefined,
    rejectReason: row.rejectReason ?? undefined,
    dueAt: row.dueAt?.toISOString(),
    paidAt: row.paidAt?.toISOString(),
    verifiedBy: row.verifiedBy ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Manual collection: per-brand payment methods and payment requests the team
 * confirms by checking its own account. No gateway, no keys, no money moved
 * by the app. Every status change is audited; a transaction reference can
 * confirm only one payment (stops a reused receipt).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly notifications: NotificationsService,
    private readonly access: WorkspaceAccessService,
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() private readonly receipts?: ReceiptStore,
    @Optional() private readonly rates?: UsdtRateService,
    @Optional() private readonly alerts?: PlanPaymentAlerts,
  ) {}

  private requireDb(): void {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
  }

  // ── Methods ────────────────────────────────────────────────────────────────

  async methods(workspaceId: string): Promise<PaymentMethod[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.paymentMethod.findMany({
      where: { workspaceSlug: workspaceId },
      orderBy: { createdAt: "asc" },
      take: METHODS_LIMIT,
    });
    return rows.map(mapMethod);
  }

  async createMethod(workspaceId: string, actor: string, dto: PaymentMethodDto): Promise<PaymentMethod> {
    this.requireDb();
    const count = await this.prisma.paymentMethod.count({ where: { workspaceSlug: workspaceId } });
    if (count >= METHODS_LIMIT) throw new BadRequestException("Has llegado al máximo de métodos de cobro.");
    const row = await this.prisma.paymentMethod.create({
      data: {
        workspaceSlug: workspaceId,
        kind: dto.kind,
        label: dto.label.trim(),
        currency: dto.currency,
        details: cleanDetails(dto.kind, dto.details),
        instructions: dto.instructions?.trim() || null,
        active: dto.active ?? true,
      },
    });
    await this.audit.record(workspaceId, actor, "payment-method.create", row.label);
    return mapMethod(row);
  }

  async updateMethod(workspaceId: string, actor: string, id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    this.requireDb();
    const current = await this.prisma.paymentMethod.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!current) throw new NotFoundException("Método de cobro no encontrado.");
    const row = await this.prisma.paymentMethod.update({
      where: { id },
      data: {
        label: dto.label?.trim(),
        currency: dto.currency,
        details: dto.details ? cleanDetails(current.kind as PaymentMethodKind, dto.details) : undefined,
        instructions: dto.instructions === undefined ? undefined : dto.instructions.trim() || null,
        active: dto.active,
      },
    });
    await this.audit.record(workspaceId, actor, "payment-method.update", row.label);
    return mapMethod(row);
  }

  async removeMethod(workspaceId: string, actor: string, id: string): Promise<void> {
    this.requireDb();
    const current = await this.prisma.paymentMethod.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!current) throw new NotFoundException("Método de cobro no encontrado.");
    // Requests keep `methodLabel`, so their history still says how they were paid.
    await this.prisma.paymentMethod.delete({ where: { id } });
    await this.audit.record(workspaceId, actor, "payment-method.delete", current.label);
  }

  // ── Requests ───────────────────────────────────────────────────────────────

  async list(workspaceId: string, filter: { status?: string; contactId?: string } = {}): Promise<PaymentRequest[]> {
    if (!this.prisma.enabled) return [];
    if (filter.status && !(PAYMENT_STATUSES as readonly string[]).includes(filter.status)) {
      throw new BadRequestException("Estado no válido.");
    }
    const rows = await this.prisma.paymentRequest.findMany({
      where: {
        workspaceSlug: workspaceId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.contactId ? { contactId: filter.contactId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAYMENTS_LIMIT,
    });
    const names = await this.contactNames(workspaceId, rows.map((r) => r.contactId));
    return rows.map((r) => mapPayment(r, r.contactId ? names.get(r.contactId) : undefined));
  }

  async create(workspaceId: string, actor: string, dto: CreatePaymentDto): Promise<PaymentRequest> {
    this.requireDb();
    const contactName = dto.contactId ? await this.checkContact(workspaceId, dto.contactId) : undefined;
    const row = await this.prisma.paymentRequest.create({
      data: {
        workspaceSlug: workspaceId,
        concept: dto.concept.trim(),
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        contactId: dto.contactId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        note: dto.note?.trim() || null,
        createdBy: actor,
      },
    });
    await this.audit.record(workspaceId, actor, "payment.create", `${row.concept} · ${row.amount.toString()} ${row.currency}`);
    return mapPayment(row, contactName);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdatePaymentDto): Promise<PaymentRequest> {
    this.requireDb();
    const current = await this.prisma.paymentRequest.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!current) throw new NotFoundException("Cobro no encontrado.");
    const from = current.status as PaymentStatus;
    const to = dto.status ?? from;
    if (to !== from && !PAYMENT_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Un cobro «${PAYMENT_STATUS_LABEL[from]}» no puede pasar a «${PAYMENT_STATUS_LABEL[to]}».`);
    }
    if ((from === "pagado" || from === "cancelado") && to === from) {
      throw new BadRequestException("Un cobro cerrado no se edita; reábrelo primero.");
    }

    const data: Prisma.PaymentRequestUpdateInput = {};
    if (dto.methodId !== undefined) {
      if (dto.methodId === null) {
        data.methodId = null;
        data.methodLabel = null;
      } else {
        const method = await this.prisma.paymentMethod.findFirst({ where: { id: dto.methodId, workspaceSlug: workspaceId } });
        if (!method) throw new BadRequestException("Ese método de cobro no es de este workspace.");
        data.methodId = method.id;
        data.methodLabel = method.label;
      }
    }
    if (dto.reference !== undefined) data.reference = dto.reference?.trim() || null;
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.rejectReason !== undefined) data.rejectReason = dto.rejectReason?.trim() || null;

    if (to !== from) {
      data.status = to;
      if (to === "pagado") {
        const reference = data.reference === undefined ? current.reference : (data.reference as string | null);
        if (reference) await this.checkReferenceUnused(workspaceId, id, reference);
        data.paidAt = new Date();
        data.verifiedBy = actor;
        data.rejectReason = null;
      } else {
        data.paidAt = null;
        data.verifiedBy = null;
      }
      if (to === "rechazado" && !(data.rejectReason ?? current.rejectReason)) {
        throw new BadRequestException("Indica por qué se rechaza el pago.");
      }
      if (to !== "rechazado" && dto.rejectReason === undefined) data.rejectReason = null;
    }

    const row = await this.prisma.paymentRequest.update({ where: { id }, data });
    if (to !== from) {
      await this.audit.record(
        workspaceId,
        actor,
        `payment.${to}`,
        `${row.concept} · ${row.amount.toString()} ${row.currency}${row.reference ? ` · ref ${row.reference}` : ""}`,
      );
    }
    // A confirmed plan payment of a customer brand opens it for another period.
    if (to === "pagado" && from !== to && row.forWorkspace) {
      const days = this.config.get("billing", { infer: true }).plan.days;
      const planId = salesPlanId(row.planId) ?? "pro";
      const state = await this.access.activate(row.forWorkspace, days, actor, new Date(), planId);
      await this.audit.record(
        row.forWorkspace,
        actor,
        "access.activate",
        `Plan ${SALES_PLANS[planId].name} · +${days} días · hasta ${state.paidUntil} · cobro ${row.id}`,
      );
    }
    const names = await this.contactNames(workspaceId, [row.contactId]);
    const contactName = row.contactId ? names.get(row.contactId) : undefined;
    if (to === "por_verificar" && from !== to) await this.noticeToVerify(workspaceId, row, contactName);
    return mapPayment(row, contactName);
  }

  /**
   * A customer brand sends its plan payment: who paid, from where, the
   * reference and the receipt. The amount is the plan's price (never the
   * client's); a method in bolívares also stores the amount in VES at today's
   * USDT rate. It lands in the operator's billing brand as «Por verificar»
   * and the operator is told by WhatsApp, email and in-app; the brand opens
   * when they approve it (here in /admin, or as «Pagado» in Cobros).
   */
  async submitPlanPayment(
    billingWorkspace: string,
    forWorkspace: string,
    forName: string,
    actor: string,
    input: { methodId: string; reference: string; payer: Record<string, unknown> },
    planId: SalesPlanId = "pro",
    receipt?: Buffer,
  ): Promise<RequestRow> {
    this.requireDb();
    const billing = this.config.get("billing", { infer: true });
    const plan = { ...billing.plan, price: planId === "basico" ? billing.basicPrice : billing.plan.price };
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id: input.methodId, workspaceSlug: billingWorkspace, active: true },
    });
    if (!method) throw new BadRequestException("Ese método de pago no está disponible.");
    const payer = cleanPayer(method.kind, input.payer);
    const reference = input.reference.trim();
    const waiting = await this.prisma.paymentRequest.findFirst({
      where: { workspaceSlug: billingWorkspace, forWorkspace, status: "por_verificar" },
      select: { id: true },
    });
    if (waiting) throw new ConflictException("Ya enviaste un pago que estamos verificando. Te avisaremos al confirmarlo.");
    await this.checkReferenceUnused(billingWorkspace, "", reference);
    // A reference already sent by ANY brand and not rejected is a reused receipt.
    const sent = await this.prisma.paymentRequest.findFirst({
      where: {
        workspaceSlug: billingWorkspace,
        forWorkspace: { not: null },
        status: { in: ["por_verificar", "pagado"] },
        reference: { equals: reference, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (sent) throw new ConflictException("Esa referencia ya se envió en otro pago. Revisa el número de operación.");

    // Bolívares at today's USDT rate (USD/USDT plan prices only).
    let local: { localAmount: Prisma.Decimal; localCurrency: string; rate: Prisma.Decimal } | null = null;
    if (method.currency === "VES" && (plan.currency === "USD" || plan.currency === "USDT")) {
      const rate = await this.rates?.current();
      if (rate) {
        local = {
          localAmount: new Prisma.Decimal(vesAmount(plan.price, rate.rate)),
          localCurrency: "VES",
          rate: new Prisma.Decimal(rate.rate),
        };
      }
    }

    // The receipt is checked (real type, size) and kept privately last, so a
    // refused payment leaves no file behind.
    const stored = this.receipts ? await this.receipts.save(receipt) : null;
    const row = await this.prisma.paymentRequest.create({
      data: {
        workspaceSlug: billingWorkspace,
        forWorkspace,
        concept: `Plan ${SALES_PLANS[planId].name} · ${forName} (${forWorkspace}) · ${plan.days} días`,
        planId,
        amount: new Prisma.Decimal(plan.price),
        currency: plan.currency,
        status: "por_verificar",
        methodId: method.id,
        methodLabel: method.label,
        reference,
        payer,
        ...(stored ? { receiptFile: stored.file, receiptType: stored.type } : {}),
        ...(local ?? {}),
        note: `Enviado por ${actor}`,
        createdBy: actor,
      },
    });
    await this.audit.record(billingWorkspace, actor, "payment.por_verificar", `${row.concept} · ${row.amount.toString()} ${row.currency} · ref ${reference}`);
    await this.noticeToVerify(billingWorkspace, row, undefined);
    if (this.alerts) {
      const file = stored && this.receipts ? await this.receipts.read(stored.file).catch(() => undefined) : undefined;
      await this.alerts
        .send({
          id: row.id,
          forWorkspace,
          forName,
          planId,
          amount: plan.price,
          currency: plan.currency,
          localAmount: local ? Number(local.localAmount) : null,
          localCurrency: local?.localCurrency ?? null,
          rate: local ? Number(local.rate) : null,
          methodKind: method.kind,
          methodLabel: method.label,
          reference,
          payer,
          sentBy: actor,
          receipt: file,
        })
        .catch((err: unknown) => this.logger.warn(`Aviso del pago ${row.id} falló: ${(err as Error).message}`));
    }
    return row;
  }

  // ── Plan payments, for the platform admin ─────────────────────────────────

  async planPayments(billingWorkspace: string): Promise<PlanPaymentReview[]> {
    if (!this.prisma.enabled || !billingWorkspace) return [];
    const rows = await this.prisma.paymentRequest.findMany({
      where: { workspaceSlug: billingWorkspace, forWorkspace: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const order = (s: string) => (s === "por_verificar" ? 0 : 1);
    return rows.sort((a, b) => order(a.status) - order(b.status)).map(mapPlanReview);
  }

  async planPaymentReceipt(billingWorkspace: string, id: string) {
    const row = await this.prisma.paymentRequest.findFirst({
      where: { id, workspaceSlug: billingWorkspace, forWorkspace: { not: null } },
      select: { receiptFile: true },
    });
    if (!row || !this.receipts) throw new NotFoundException("Pago no encontrado.");
    return this.receipts.read(row.receiptFile);
  }

  /** Approve (→ «Pagado», opens the brand) or reject (with a reason the customer sees). */
  async reviewPlanPayment(
    billingWorkspace: string,
    actor: string,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
  ): Promise<PlanPaymentReview> {
    const row = await this.prisma.paymentRequest.findFirst({
      where: { id, workspaceSlug: billingWorkspace, forWorkspace: { not: null } },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Pago no encontrado.");
    await this.update(
      billingWorkspace,
      actor,
      id,
      decision.approve ? { status: "pagado" } : { status: "rechazado", rejectReason: decision.reason },
    );
    const fresh = await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id } });
    return mapPlanReview(fresh);
  }

  /**
   * Tell the whole team (in-app only) that a payment is waiting for someone
   * to check the account. A failed notice never undoes the status change.
   */
  private async noticeToVerify(
    workspaceId: string,
    row: {
      concept: string;
      amount: Prisma.Decimal;
      currency: string;
      methodLabel: string | null;
      reference: string | null;
      forWorkspace?: string | null;
    },
    contactName: string | undefined,
  ): Promise<void> {
    const meta = [
      contactName,
      formatPaymentAmount(Number(row.amount.toString()), row.currency as PaymentCurrency),
      row.methodLabel,
      row.reference ? `ref ${row.reference}` : null,
      "forWorkspace" in row && row.forWorkspace
        ? "Revisa el comprobante y apruébalo en /admin (o en Cobros)."
        : "Revisa la cuenta y confírmalo en Cobros.",
    ]
      .filter(Boolean)
      .join(" · ");
    try {
      await this.notifications.create(workspaceId, { type: "warning", title: `Cobro por verificar: ${row.concept}`, meta });
    } catch (err) {
      this.logger.warn(`No se pudo avisar del cobro por verificar: ${(err as Error).message}`);
    }
  }

  /** A reference that already confirmed another payment is most likely a reused receipt. */
  private async checkReferenceUnused(workspaceId: string, id: string, reference: string): Promise<void> {
    const dup = await this.prisma.paymentRequest.findFirst({
      where: {
        workspaceSlug: workspaceId,
        status: "pagado",
        id: { not: id },
        reference: { equals: reference, mode: "insensitive" },
      },
      select: { concept: true },
    });
    if (dup) {
      throw new ConflictException(`La referencia ${reference} ya confirmó el cobro «${dup.concept}». Revisa que no sea un comprobante repetido.`);
    }
  }

  private async checkContact(workspaceId: string, contactId: string): Promise<string> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceSlug: workspaceId },
      select: { name: true },
    });
    if (!contact) throw new BadRequestException("Ese contacto no es de este workspace.");
    return contact.name;
  }

  private async contactNames(workspaceId: string, ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (wanted.length === 0) return new Map();
    const rows = await this.prisma.contact.findMany({
      where: { workspaceSlug: workspaceId, id: { in: wanted } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

@ApiTags("payments")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/payments")
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get("methods")
  methods(@WorkspaceId() workspaceId: string) {
    return this.service.methods(workspaceId);
  }

  // Where customers send money is set by Owners and Admins only.
  @Post("methods")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  createMethod(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: PaymentMethodDto) {
    return this.service.createMethod(workspaceId, user.email, dto);
  }

  @Patch("methods/:id")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  updateMethod(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.service.updateMethod(workspaceId, user.email, id, dto);
  }

  @Delete("methods/:id")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  removeMethod(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.removeMethod(workspaceId, user.email, id);
  }

  @Get()
  list(
    @WorkspaceId() workspaceId: string,
    @Query("status") status?: string,
    @Query("contactId") contactId?: string,
  ) {
    return this.service.list(workspaceId, { status, contactId });
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PlanMethodsSeeder, PlanPaymentAlerts],
  exports: [PaymentsService],
})
export class PaymentsModule {}
