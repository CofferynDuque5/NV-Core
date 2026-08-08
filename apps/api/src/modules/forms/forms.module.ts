import {
  BadRequestException,
  Body,
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
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  CONTACT_STAGES,
  FORM_FIELD_KEYS,
  type ContactStage,
  type Form,
  type FormField,
  type FormFieldKey,
  type FormSubmitResult,
  type PublicForm,
} from "@nv/domain";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapForm } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { Public } from "../../auth/decorators/public.decorator";
import { PlanService } from "../../common/plan/plan.service";
import { LIST_CAP } from "../../common/query-limits";

/** Public submit is unauthenticated → rate-limit hard to blunt spam/abuse. */
const SUBMIT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

export class FormFieldDto {
  @IsIn(FORM_FIELD_KEYS) key!: FormFieldKey;
  @IsString() @MinLength(1) label!: string;
  @IsBoolean() required!: boolean;
}

export class CreateFormDto {
  @IsString() @MinLength(1) name!: string;

  @ApiPropertyOptional({ type: [FormFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsIn(CONTACT_STAGES) stage?: ContactStage;
  @ApiPropertyOptional() @IsOptional() @IsString() submitLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() successMessage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() redirectUrl?: string;
}

export class UpdateFormDto extends CreateFormDto {
  @IsOptional() @IsString() @MinLength(1) declare name: string;
}

/** Public submission payload: the collected values + an anti-spam honeypot. */
export class SubmitFormDto {
  @IsOptional() values?: Record<string, string>;
  /** Hidden field; if a bot fills it we silently accept and drop. */
  @IsOptional() @IsString() hp?: string;
}

const DEFAULT_FIELDS: FormField[] = [
  { key: "name", label: "Nombre", required: true },
  { key: "email", label: "Correo", required: true },
];

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly plans: PlanService,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Form>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Form>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.form.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.form.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapForm), total);
  }

  async create(workspaceId: string, actor: string, dto: CreateFormDto): Promise<Form> {
    const row = await this.db().form.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        fields: (dto.fields ?? DEFAULT_FIELDS) as object[],
        tags: dto.tags ?? [],
        stage: dto.stage ?? "Lead",
        submitLabel: dto.submitLabel ?? "Enviar",
        successMessage: dto.successMessage ?? "¡Gracias! Te contactaremos pronto.",
        redirectUrl: dto.redirectUrl,
      },
    });
    await this.audit.record(workspaceId, actor, "form.create", row.id);
    return mapForm(row);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateFormDto): Promise<Form> {
    const existing = await this.db().form.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Formulario no encontrado.");
    const row = await this.prisma.form.update({
      where: { id },
      data: {
        name: dto.name,
        fields: dto.fields ? (dto.fields as object[]) : undefined,
        tags: dto.tags,
        stage: dto.stage,
        submitLabel: dto.submitLabel,
        successMessage: dto.successMessage,
        redirectUrl: dto.redirectUrl,
      },
    });
    await this.audit.record(workspaceId, actor, "form.update", id);
    return mapForm(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().form.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Formulario no encontrado.");
    await this.audit.record(workspaceId, actor, "form.delete", id);
  }

  // ── Public surface ─────────────────────────────────────────────────────────

  /** Public render payload; counts the view. Never leaks tags/stage/stats. */
  async getPublic(id: string): Promise<PublicForm> {
    const row = await this.db().form.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Formulario no encontrado.");
    await this.prisma.form.update({ where: { id }, data: { views: { increment: 1 } } });
    const fields = ((row.fields as unknown as FormField[]) ?? []).length
      ? (row.fields as unknown as FormField[])
      : DEFAULT_FIELDS;
    return { id: row.id, name: row.name, fields, submitLabel: row.submitLabel };
  }

  /** Public submission → create/dedupe a Contact, apply tags + stage. */
  async submit(id: string, values: Record<string, string>): Promise<FormSubmitResult> {
    const form = await this.db().form.findUnique({ where: { id } });
    if (!form) throw new NotFoundException("Formulario no encontrado.");
    const ws = form.workspaceSlug;
    const fields = ((form.fields as unknown as FormField[]) ?? []).length
      ? (form.fields as unknown as FormField[])
      : DEFAULT_FIELDS;

    // Validate required fields per the form definition.
    for (const f of fields) {
      if (f.required && !String(values[f.key] ?? "").trim()) {
        throw new BadRequestException(`El campo "${f.label}" es obligatorio.`);
      }
    }
    const email = String(values.email ?? "").trim().toLowerCase();
    const name = String(values.name ?? "").trim() || email || "Lead";

    // Dedupe by email within the workspace; merge tags if the contact exists.
    const existing = email
      ? await this.prisma.contact.findFirst({ where: { workspaceSlug: ws, email } })
      : null;

    if (existing) {
      const mergedTags = Array.from(new Set([...(existing.tags ?? []), ...(form.tags ?? [])]));
      await this.prisma.contact.update({ where: { id: existing.id }, data: { tags: mergedTags } });
    } else {
      // A new contact counts against the workspace plan (402 when exceeded).
      await this.plans.assertWithinLimit(ws, "contacts", 1);
      await this.prisma.contact.create({
        data: {
          workspaceSlug: ws,
          name,
          email: email || null,
          phone: String(values.phone ?? "").trim() || null,
          company: String(values.company ?? "").trim() || null,
          tags: form.tags ?? [],
          stage: form.stage,
        },
      });
    }

    await this.prisma.form.update({ where: { id }, data: { submissions: { increment: 1 } } });
    await this.audit.record(ws, "public", "form.submit", id);
    return {
      ok: true,
      successMessage: form.successMessage,
      redirectUrl: form.redirectUrl ?? undefined,
    };
  }
}

@ApiTags("forms")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/forms")
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFormDto,
  ) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }

  @Delete(":id")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  remove(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(workspaceId, user.email, id);
  }
}

/** Unauthenticated endpoints for rendering + submitting an embeddable form. */
@ApiTags("forms")
@Public()
@Controller("public/forms")
export class PublicFormsController {
  constructor(private readonly service: FormsService) {}

  @Get(":id")
  render(@Param("id") id: string) {
    return this.service.getPublic(id);
  }

  @Post(":id/submit")
  @Throttle(SUBMIT_THROTTLE)
  @HttpCode(200)
  submit(@Param("id") id: string, @Body() dto: SubmitFormDto) {
    // Honeypot: a filled hidden field means a bot — accept silently, don't write.
    if (dto.hp && dto.hp.trim()) {
      return { ok: true, successMessage: "¡Gracias!" };
    }
    return this.service.submit(id, dto.values ?? {});
  }
}

@Module({
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService],
})
export class FormsModule {}
