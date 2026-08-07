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
import type { Template, TemplateImportResult } from "@nv/domain";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { parseCsv, toCsv } from "../../common/csv";
import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapTemplate } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { LIST_CAP } from "../../common/query-limits";

export class CreateTemplateDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class ImportTemplatesDto {
  @IsString() @MaxLength(5_000_000) csv!: string;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() @MinLength(1) body?: string;
  @IsOptional() @IsString() category?: string;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Template>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Template>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.template.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.template.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapTemplate), total);
  }

  async create(workspaceId: string, actor: string, dto: CreateTemplateDto): Promise<Template> {
    const row = await this.db().template.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        body: dto.body,
        category: dto.category ?? "General",
      },
    });
    await this.audit.record(workspaceId, actor, "template.create", row.id);
    return mapTemplate(row);
  }

  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateTemplateDto,
  ): Promise<Template> {
    const existing = await this.db().template.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    if (!existing) throw new NotFoundException("Plantilla no encontrada.");
    const row = await this.prisma.template.update({ where: { id }, data: dto });
    await this.audit.record(workspaceId, actor, "template.update", id);
    return mapTemplate(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().template.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Plantilla no encontrada.");
    await this.audit.record(workspaceId, actor, "template.delete", id);
  }

  private static readonly EXPORT_COLUMNS = ["name", "category", "body"];

  async exportCsv(workspaceId: string): Promise<string> {
    const cols = TemplatesService.EXPORT_COLUMNS;
    if (!this.prisma.enabled) return toCsv([], cols);
    const rows: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.template.findMany({
        where: { workspaceSlug: workspaceId },
        orderBy: { id: "asc" },
        take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const t of batch) {
        rows.push({ name: t.name, category: t.category, body: t.body });
      }
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < 1000) break;
    }
    return toCsv(rows, cols);
  }

  async importCsv(workspaceId: string, actor: string, csv: string): Promise<TemplateImportResult> {
    const db = this.db();
    const records = parseCsv(csv);
    const MAX = 2000;
    if (records.length > MAX) {
      throw new BadRequestException(`Máximo ${MAX} filas por importación (recibidas ${records.length}).`);
    }

    // Preload existing template names once for dedupe (case-insensitive).
    const existingRows = await db.template.findMany({
      where: { workspaceSlug: workspaceId },
      select: { name: true },
    });
    const seen = new Set(existingRows.map((r) => r.name.toLowerCase()));

    const pick = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        const v = r[k];
        if (v && v.trim()) return v.trim();
      }
      return "";
    };

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      const line = i + 2; // +1 header, +1 to 1-index
      const name = pick(r, "name", "nombre");
      if (!name) {
        errors.push(`Fila ${line}: falta el nombre.`);
        continue;
      }
      const body = pick(r, "body", "cuerpo", "contenido", "mensaje");
      if (!body) {
        errors.push(`Fila ${line}: falta el cuerpo.`);
        continue;
      }
      const nameKey = name.toLowerCase();
      if (seen.has(nameKey)) {
        skipped++;
        continue;
      }
      const category = pick(r, "category", "categoria", "categoría") || "General";
      try {
        await db.template.create({
          data: { workspaceSlug: workspaceId, name, body, category },
        });
        created++;
        seen.add(nameKey);
      } catch (err) {
        errors.push(`Fila ${line}: ${(err as Error).message}`);
      }
    }
    await this.audit.record(workspaceId, actor, "templates.import", `created=${created} skipped=${skipped}`);
    return { created, skipped, errors: errors.slice(0, 50) };
  }
}

@ApiTags("templates")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/templates")
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get("export")
  async export(@WorkspaceId() workspaceId: string): Promise<{ csv: string }> {
    return { csv: await this.service.exportCsv(workspaceId) };
  }

  @Post("import")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  importCsv(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportTemplatesDto,
  ) {
    return this.service.importCsv(workspaceId, user.email, dto.csv);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTemplateDto,
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
    @Body() dto: UpdateTemplateDto,
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

@Module({ controllers: [TemplatesController], providers: [TemplatesService] })
export class TemplatesModule {}
