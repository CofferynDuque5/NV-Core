import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
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
  paymentMethodDef,
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
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
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
    const names = await this.contactNames(workspaceId, [row.contactId]);
    return mapPayment(row, row.contactId ? names.get(row.contactId) : undefined);
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

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
