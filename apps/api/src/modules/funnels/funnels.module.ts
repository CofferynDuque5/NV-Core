import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  FUNNEL_STEP_TYPES,
  type Funnel,
  type FunnelPage,
  type FunnelStepType,
  type PublicFunnelStep,
} from "@nv/domain";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapFunnel } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { Public } from "../../auth/decorators/public.decorator";
import { LIST_CAP } from "../../common/query-limits";

export class FunnelPageDto {
  @IsString() id!: string;
  @IsString() @MinLength(1) name!: string;
  @IsIn(FUNNEL_STEP_TYPES) type!: FunnelStepType;
  @ApiPropertyOptional() @IsOptional() @IsString() formId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() headline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaLabel?: string;
}

export class CreateFunnelDto {
  @IsString() @MinLength(1) name!: string;

  @ApiPropertyOptional({ type: [FunnelPageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FunnelPageDto)
  steps?: FunnelPageDto[];
}

export class UpdateFunnelDto extends CreateFunnelDto {
  @IsOptional() @IsString() @MinLength(1) declare name: string;
}

/** Normalize DTO steps into stored FunnelPage[] (views default to 0). */
function toSteps(dtoSteps: FunnelPageDto[] | undefined, prev: FunnelPage[] = []): FunnelPage[] {
  return (dtoSteps ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    formId: s.formId,
    headline: s.headline,
    body: s.body,
    ctaLabel: s.ctaLabel,
    // Preserve existing view counts across edits (match by step id).
    views: prev.find((p) => p.id === s.id)?.views ?? 0,
  }));
}

@Injectable()
export class FunnelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Funnel>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Funnel>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.funnel.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.funnel.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapFunnel), total);
  }

  async create(workspaceId: string, actor: string, dto: CreateFunnelDto): Promise<Funnel> {
    const row = await this.db().funnel.create({
      data: { workspaceSlug: workspaceId, name: dto.name, steps: toSteps(dto.steps) as object[] },
    });
    await this.audit.record(workspaceId, actor, "funnel.create", row.id);
    return mapFunnel(row);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateFunnelDto): Promise<Funnel> {
    const existing = await this.db().funnel.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Embudo no encontrado.");
    const prev = (existing.steps as unknown as FunnelPage[]) ?? [];
    const row = await this.prisma.funnel.update({
      where: { id },
      data: {
        name: dto.name,
        steps: dto.steps ? (toSteps(dto.steps, prev) as object[]) : undefined,
      },
    });
    await this.audit.record(workspaceId, actor, "funnel.update", id);
    return mapFunnel(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().funnel.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Embudo no encontrado.");
    await this.audit.record(workspaceId, actor, "funnel.delete", id);
  }

  /** Public render of one step; counts the visit (read-modify-write). */
  async getPublicStep(id: string, index: number): Promise<PublicFunnelStep> {
    const row = await this.db().funnel.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Embudo no encontrado.");
    const steps = (row.steps as unknown as FunnelPage[]) ?? [];
    if (index < 0 || index >= steps.length) throw new NotFoundException("Paso no encontrado.");
    const step = steps[index]!;

    // Count the visit (approximate analytics; low contention).
    steps[index] = { ...step, views: (step.views ?? 0) + 1 };
    await this.prisma.funnel.update({ where: { id }, data: { steps: steps as object[] } });

    return {
      funnelId: row.id,
      index,
      total: steps.length,
      name: step.name,
      type: step.type,
      formId: step.formId,
      headline: step.headline,
      body: step.body,
      ctaLabel: step.ctaLabel,
      nextIndex: index + 1 < steps.length ? index + 1 : null,
    };
  }
}

@ApiTags("funnels")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/funnels")
export class FunnelsController {
  constructor(private readonly service: FunnelsService) {}

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
    @Body() dto: CreateFunnelDto,
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
    @Body() dto: UpdateFunnelDto,
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

/** Unauthenticated funnel step renderer (embeds forms client-side by id). */
@ApiTags("funnels")
@Public()
@Controller("public/funnels")
export class PublicFunnelsController {
  constructor(private readonly service: FunnelsService) {}

  @Get(":id/steps/:index")
  step(@Param("id") id: string, @Param("index", ParseIntPipe) index: number) {
    return this.service.getPublicStep(id, index);
  }
}

@Module({
  controllers: [FunnelsController, PublicFunnelsController],
  providers: [FunnelsService],
})
export class FunnelsModule {}
