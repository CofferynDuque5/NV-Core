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
import { IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapContact, mapSegment } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { LIST_CAP } from "../../common/query-limits";
import { buildContactWhere, rulesError } from "./segment-eval";

/** Max matching contacts returned by the rule-builder preview. */
const PREVIEW_SAMPLE = 25;

export class SegmentRuleDto {
  @IsIn(SEGMENT_FIELDS)
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
    const counts = await Promise.all(
      rows.map((r) =>
        this.prisma.contact.count({
          where: buildContactWhere(
            workspaceId,
            (r.rules as unknown as SegmentRule[]) ?? [],
            (r.match as SegmentMatch) ?? "all",
            now,
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
    const where = buildContactWhere(workspaceId, rules, dto.match ?? "all");
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
    return this.prisma.contact.count({ where: buildContactWhere(workspaceId, rules, match) });
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
