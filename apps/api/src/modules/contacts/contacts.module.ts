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
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  CONTACT_STAGES,
  type Contact,
  type ContactImportResult,
  type ContactStage,
} from "@nv/domain";
import { Prisma } from "@prisma/client";
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { parseCsv, toCsv } from "../../common/csv";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PlanService } from "../../common/plan/plan.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapContact, mapContactNote } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

/** Contacts list query: pagination + server-side search + stage filter. */
export class ContactsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CONTACT_STAGES })
  @IsOptional()
  @IsIn(CONTACT_STAGES)
  stage?: ContactStage;
}

export class ImportContactsDto {
  @ApiPropertyOptional({ description: "Contenido CSV (cabecera + filas)." })
  @IsString()
  @MaxLength(5_000_000) // ~5 MB guard
  csv!: string;
}

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: CONTACT_STAGES })
  @IsOptional()
  @IsIn(CONTACT_STAGES)
  stage?: ContactStage;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsIn(CONTACT_STAGES) stage?: ContactStage;
}

export class AddContactNoteDto {
  @IsString() @MinLength(1) body!: string;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly plans: PlanService,
  ) {}

  private db() {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException("Base de datos no configurada.");
    }
    return this.prisma;
  }

  async list(workspaceId: string, query: ContactsQueryDto): Promise<ListResultDto<Contact>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Contact>();
    const q = query.q?.trim();
    // Search/stage run in the DB so results are authoritative across the whole
    // workspace — never limited to the current page (the old client-side filter
    // over the first 100 rows silently missed matches beyond it).
    const where: Prisma.ContactWhereInput = {
      workspaceSlug: workspaceId,
      ...(query.stage ? { stage: query.stage } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { tags: { has: q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapContact), total);
  }

  private static readonly EXPORT_COLUMNS = [
    "name",
    "phone",
    "email",
    "company",
    "tags",
    "stage",
    "createdAt",
  ];

  /** Export every contact as CSV, paged internally so it scales to large tenants. */
  async exportCsv(workspaceId: string): Promise<string> {
    const cols = ContactsService.EXPORT_COLUMNS;
    if (!this.prisma.enabled) return toCsv([], cols);
    const rows: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.contact.findMany({
        where: { workspaceSlug: workspaceId },
        orderBy: { id: "asc" },
        take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const c of batch) {
        rows.push({
          name: c.name,
          phone: c.phone ?? "",
          email: c.email ?? "",
          company: c.company ?? "",
          tags: (c.tags ?? []).join(";"),
          stage: c.stage,
          createdAt: c.createdAt.toISOString(),
        });
      }
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < 1000) break;
    }
    return toCsv(rows, cols);
  }

  /** Bulk-create contacts from CSV. Dedupes by email (case-insensitive). */
  async importCsv(workspaceId: string, actor: string, csv: string): Promise<ContactImportResult> {
    const db = this.db();
    const records = parseCsv(csv);
    const MAX = 5000;
    if (records.length > MAX) {
      throw new BadRequestException(`Máximo ${MAX} filas por importación (recibidas ${records.length}).`);
    }

    // Preload existing emails once for dedupe (bounded set, cheap vs. per-row query).
    const existingRows = await db.contact.findMany({
      where: { workspaceSlug: workspaceId, email: { not: null } },
      select: { email: true },
    });
    const seen = new Set(existingRows.map((r) => r.email!.toLowerCase()));

    const pick = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        const v = r[k];
        if (v && v.trim()) return v.trim();
      }
      return "";
    };

    let skipped = 0;
    const errors: string[] = [];

    // Phase 1: validate + dedupe into a pending list. We enforce the plan limit
    // on this list *before* writing anything, so a Free workspace that would go
    // over its cap gets a clean 402 with no partial import left behind.
    const toCreate: { line: number; data: Prisma.ContactUncheckedCreateInput }[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      const line = i + 2; // +1 header, +1 to 1-index
      const name = pick(r, "name", "nombre");
      if (!name) {
        errors.push(`Fila ${line}: falta el nombre.`);
        continue;
      }
      const email = pick(r, "email", "correo");
      const emailKey = email.toLowerCase();
      if (emailKey && seen.has(emailKey)) {
        skipped++;
        continue;
      }
      const stageRaw = pick(r, "stage", "etapa");
      const stage = (CONTACT_STAGES as readonly string[]).includes(stageRaw)
        ? (stageRaw as ContactStage)
        : "Lead";
      const tags = pick(r, "tags", "etiquetas")
        .split(/[;,|]/)
        .map((t) => t.trim())
        .filter(Boolean);
      toCreate.push({
        line,
        data: {
          workspaceSlug: workspaceId,
          name,
          phone: pick(r, "phone", "telefono", "teléfono") || null,
          email: email || null,
          company: pick(r, "company", "empresa") || null,
          tags,
          stage,
        },
      });
      if (emailKey) seen.add(emailKey); // dedupe within the file too
    }

    // Phase 2: gate on the plan limit (402 when it would overflow), then write.
    await this.plans.assertWithinLimit(workspaceId, "contacts", toCreate.length);

    let created = 0;
    for (const { line, data } of toCreate) {
      try {
        await db.contact.create({ data });
        created++;
      } catch (err) {
        errors.push(`Fila ${line}: ${(err as Error).message}`);
      }
    }
    await this.audit.record(workspaceId, actor, "contacts.import", `created=${created} skipped=${skipped}`);
    return { created, skipped, errors: errors.slice(0, 50) };
  }

  async create(workspaceId: string, actor: string, dto: CreateContactDto): Promise<Contact> {
    await this.plans.assertWithinLimit(workspaceId, "contacts", 1);
    const row = await this.db().contact.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        company: dto.company,
        tags: dto.tags ?? [],
        stage: dto.stage ?? "Lead",
      },
    });
    await this.audit.record(workspaceId, actor, "contact.create", row.id);
    return mapContact(row);
  }

  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    const existing = await this.db().contact.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Contacto no encontrado.");
    const row = await this.prisma.contact.update({ where: { id }, data: dto });
    await this.audit.record(workspaceId, actor, "contact.update", id);
    return mapContact(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().contact.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Contacto no encontrado.");
    await this.audit.record(workspaceId, actor, "contact.delete", id);
  }

  private async ownedContact(workspaceId: string, contactId: string) {
    const contact = await this.db().contact.findFirst({ where: { id: contactId, workspaceSlug: workspaceId } });
    if (!contact) throw new NotFoundException("Contacto no encontrado.");
    return contact;
  }

  async notes(workspaceId: string, contactId: string) {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.contactNote.findMany({
      where: { workspaceSlug: workspaceId, contactId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapContactNote);
  }

  async addNote(workspaceId: string, actor: string, contactId: string, body: string) {
    await this.ownedContact(workspaceId, contactId);
    const row = await this.db().contactNote.create({
      data: { workspaceSlug: workspaceId, contactId, body, author: actor },
    });
    await this.audit.record(workspaceId, actor, "contact.note.add", contactId);
    return mapContactNote(row);
  }

  async removeNote(workspaceId: string, actor: string, contactId: string, noteId: string): Promise<void> {
    const { count } = await this.db().contactNote.deleteMany({
      where: { id: noteId, contactId, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Nota no encontrada.");
    await this.audit.record(workspaceId, actor, "contact.note.delete", noteId);
  }
}

@ApiTags("contacts")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/contacts")
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query() query: ContactsQueryDto) {
    return this.service.list(workspaceId, query);
  }

  @Get("export")
  async export(@WorkspaceId() workspaceId: string): Promise<{ csv: string }> {
    return { csv: await this.service.exportCsv(workspaceId) };
  }

  @Post("import")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  import(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportContactsDto,
  ): Promise<ContactImportResult> {
    return this.service.importCsv(workspaceId, user.email, dto.csv);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactDto,
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
    @Body() dto: UpdateContactDto,
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

  @Get(":id/notes")
  notes(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.notes(workspaceId, id);
  }

  @Post(":id/notes")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  addNote(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AddContactNoteDto,
  ) {
    return this.service.addNote(workspaceId, user.email, id, dto.body);
  }

  @Delete(":id/notes/:noteId")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  removeNote(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("noteId") noteId: string,
  ) {
    return this.service.removeNote(workspaceId, user.email, id, noteId);
  }
}

@Module({ controllers: [ContactsController], providers: [ContactsService] })
export class ContactsModule {}
