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
import {
  SEGMENT_FIELDS,
  SEGMENT_MATCH_MODES,
  SEGMENT_OPERATORS,
  type Segment,
  type SegmentField,
  type SegmentMatch,
  type SegmentOperator,
  type SegmentPreview,
  type SegmentRule,
} from "@nv/domain";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Prisma } from "@prisma/client";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapContact, mapSegment } from "../../prisma/mappers";
import { contactsCsv } from "../contacts/contacts.module";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { LIST_CAP } from "../../common/query-limits";
import { brandTimeZone, buildContactWhere, rulesError } from "./segment-eval";

/** Max matching contacts returned by the rule-builder preview. */
const PREVIEW_SAMPLE = 25;

export class SegmentRuleDto {
  @Matches(new RegExp(`^(${SEGMENT_FIELDS.join("|")}|custom\\.[a-z0-9_]{1,30})$`), {
    message: "Campo desconocido.",
  })
  field!: SegmentField;

  @IsIn(SEGMENT_OPERATORS)
  operator!: SegmentOperator;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  value?: string;
}

export class CreateSegmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ enum: SEGMENT_MATCH_MODES })
  @IsOptional()
  @IsIn(SEGMENT_MATCH_MODES)
  match?: SegmentMatch;

  @ApiPropertyOptional({ type: [SegmentRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules?: SegmentRuleDto[];
}

export class UpdateSegmentDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(SEGMENT_MATCH_MODES) match?: SegmentMatch;

  @ApiPropertyOptional({ type: [SegmentRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules?: SegmentRuleDto[];
}

export class PreviewSegmentDto {
  @IsOptional() @IsIn(SEGMENT_MATCH_MODES) match?: SegmentMatch;

  @ApiPropertyOptional({ type: [SegmentRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules!: SegmentRuleDto[];
}

export class TagAllDto {
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(40, { each: true }) add?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(40, { each: true }) remove?: string[];
}

/** Normalize DTO rules (optional value → "") and reject invalid ones. */
function toRules(dtoRules: SegmentRuleDto[] | undefined): SegmentRule[] {
  const rules: SegmentRule[] = (dtoRules ?? []).map((r) => ({
    field: r.field,
    operator: r.operator,
    value: r.value ?? "",
  }));
  const err = rulesError(rules);
  if (err) throw new BadRequestException(err);
  return rules;
}

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Segment>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Segment>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.segment.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.segment.count({ where }),
    ]);
    // Compute each segment's live audience count from its rules.
    const now = new Date();
    const tz = await brandTimeZone(this.prisma, workspaceId);
    const counts = await Promise.all(
      rows.map((r) =>
        this.prisma.contact.count({
          where: buildContactWhere(
            workspaceId,
            (r.rules as unknown as SegmentRule[]) ?? [],
            (r.match as SegmentMatch) ?? "all",
            now,
            tz,
          ),
        }),
      ),
    );
    return new ListResultDto(
      rows.map((r, i) => mapSegment(r, counts[i])),
      total,
    );
  }

  async create(workspaceId: string, actor: string, dto: CreateSegmentDto): Promise<Segment> {
    const rules = toRules(dto.rules);
    const row = await this.db().segment.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        color: dto.color ?? "#5B8DEF",
        match: dto.match ?? "all",
        rules: rules as object[],
      },
    });
    await this.audit.record(workspaceId, actor, "segment.create", row.id);
    const count = await this.countFor(workspaceId, rules, row.match as SegmentMatch);
    return mapSegment(row, count);
  }

  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateSegmentDto,
  ): Promise<Segment> {
    const existing = await this.db().segment.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Segmento no encontrado.");
    const rules = dto.rules !== undefined ? toRules(dto.rules) : undefined;
    const row = await this.prisma.segment.update({
      where: { id },
      data: {
        name: dto.name,
        color: dto.color,
        match: dto.match,
        rules: rules ? (rules as object[]) : undefined,
      },
    });
    await this.audit.record(workspaceId, actor, "segment.update", id);
    const count = await this.countFor(
      workspaceId,
      (row.rules as unknown as SegmentRule[]) ?? [],
      row.match as SegmentMatch,
    );
    return mapSegment(row, count);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().segment.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Segmento no encontrado.");
    await this.audit.record(workspaceId, actor, "segment.delete", id);
  }

  /** Evaluate ad-hoc rules against the contact base (rule-builder preview). */
  async preview(workspaceId: string, dto: PreviewSegmentDto): Promise<SegmentPreview> {
    const rules = toRules(dto.rules);
    if (!this.prisma.enabled) return { count: 0, sample: [] };
    const where = buildContactWhere(
      workspaceId,
      rules,
      dto.match ?? "all",
      new Date(),
      await brandTimeZone(this.prisma, workspaceId),
    );
    const [count, sample] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PREVIEW_SAMPLE,
      }),
    ]);
    return { count, sample: sample.map(mapContact) };
  }

  private async countFor(
    workspaceId: string,
    rules: SegmentRule[],
    match: SegmentMatch,
  ): Promise<number> {
    if (!this.prisma.enabled) return 0;
    const tz = await brandTimeZone(this.prisma, workspaceId);
    return this.prisma.contact.count({ where: buildContactWhere(workspaceId, rules, match, new Date(), tz) });
  }

  /** Where-clause of one of the brand's segments (404 otherwise). */
  private async whereOf(workspaceId: string, id: string): Promise<Prisma.ContactWhereInput> {
    const seg = await this.db().segment.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!seg) throw new NotFoundException("Segmento no encontrado.");
    return buildContactWhere(
      workspaceId,
      (seg.rules as unknown as SegmentRule[]) ?? [],
      (seg.match as SegmentMatch) ?? "all",
      new Date(),
      await brandTimeZone(this.prisma, workspaceId),
    );
  }

  /** CSV of the segment's contacts, same columns as Contactos → Exportar. */
  async exportCsv(workspaceId: string, id: string): Promise<string> {
    return contactsCsv(this.prisma, workspaceId, await this.whereOf(workspaceId, id));
  }

  /** Add and/or remove tags on every contact currently in the segment. */
  async tagAll(workspaceId: string, actor: string, id: string, dto: TagAllDto): Promise<{ updated: number }> {
    const clean = (l?: string[]) => [...new Set((l ?? []).map((t) => t.trim()).filter(Boolean))];
    const add = clean(dto.add);
    const remove = clean(dto.remove);
    if (add.length === 0 && remove.length === 0) throw new BadRequestException("Indica qué etiquetas poner o quitar.");
    const where = await this.whereOf(workspaceId, id);
    const rows = await this.prisma.contact.findMany({ where, select: { id: true }, take: 50_000 });
    const ids = rows.map((r) => r.id);
    let updated = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      // One statement per chunk: union with the new tags, minus the removed ones.
      updated += await this.prisma.$executeRaw`
        UPDATE "Contact" SET tags = COALESCE((
          SELECT array_agg(DISTINCT t ORDER BY t) FROM unnest(tags || ${add}::text[]) AS t
          WHERE NOT (t = ANY(${remove}::text[]))
        ), '{}')
        WHERE id = ANY(${chunk}::text[]) AND "workspaceSlug" = ${workspaceId}`;
    }
    await this.audit.record(workspaceId, actor, "segment.tag_all", `${id} +${add.join(",")} -${remove.join(",")} (${updated})`);
    return { updated };
  }
}

@ApiTags("segments")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/segments")
export class SegmentsController {
  constructor(private readonly service: SegmentsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Post("preview")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  preview(@WorkspaceId() workspaceId: string, @Body() dto: PreviewSegmentDto) {
    return this.service.preview(workspaceId, dto);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSegmentDto,
  ) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Get(":id/export")
  async export(@WorkspaceId() workspaceId: string, @Param("id") id: string): Promise<{ csv: string }> {
    return { csv: await this.service.exportCsv(workspaceId, id) };
  }

  @Post(":id/tags")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  tagAll(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: TagAllDto,
  ) {
    return this.service.tagAll(workspaceId, user.email, id, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateSegmentDto,
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

@Module({ controllers: [SegmentsController], providers: [SegmentsService] })
export class SegmentsModule {}
