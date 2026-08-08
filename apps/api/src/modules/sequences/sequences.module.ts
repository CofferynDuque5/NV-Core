import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  SEQUENCE_CHANNELS,
  type Sequence,
  type SequenceChannel,
  type SequenceEnrollment,
  type SequenceEnrollResult,
  type SequencePreviewStep,
  type SequenceStep,
} from "@nv/domain";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapSequence, mapSequenceEnrollment } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { OutboundDispatcher } from "../../providers/outbound-dispatcher.service";
import { ProvidersModule } from "../../providers/providers.module";
import { LIST_CAP } from "../../common/query-limits";
import { addDays, previewSchedule, recipientFor } from "./sequence-engine";

const TICK_MS = 60_000;
const DUE_BATCH = 100;

export class SequenceStepDto {
  @IsString() id!: string;
  @IsInt() @Min(0) delayDays!: number;
  @IsIn(SEQUENCE_CHANNELS) channel!: SequenceChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
}

export class CreateSequenceDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsIn(["active", "paused"]) status?: "active" | "paused";

  @ApiPropertyOptional({ type: [SequenceStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SequenceStepDto)
  steps?: SequenceStepDto[];
}

export class UpdateSequenceDto extends CreateSequenceDto {
  @IsOptional() @IsString() @MinLength(1) declare name: string;
}

export class EnrollDto {
  @ApiPropertyOptional() @IsOptional() @IsString() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
}

@Injectable()
export class SequencesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SequencesService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly dispatcher: OutboundDispatcher,
  ) {}

  onModuleInit(): void {
    if (!this.prisma.enabled) {
      this.logger.log("Motor de secuencias inactivo (sin base de datos).");
      return;
    }
    this.timer = setInterval(() => void this.processDue(new Date()), TICK_MS);
    this.logger.log(`Motor de secuencias activo (cada ${TICK_MS / 1000}s).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  private async countActive(sequenceId: string): Promise<number> {
    return this.prisma.sequenceEnrollment.count({ where: { sequenceId, status: "active" } });
  }

  async list(workspaceId: string): Promise<ListResultDto<Sequence>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Sequence>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.sequence.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.sequence.count({ where }),
    ]);
    const counts = await Promise.all(rows.map((r) => this.countActive(r.id)));
    return new ListResultDto(
      rows.map((r, i) => mapSequence(r, counts[i])),
      total,
    );
  }

  async create(workspaceId: string, actor: string, dto: CreateSequenceDto): Promise<Sequence> {
    const row = await this.db().sequence.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        status: dto.status ?? "active",
        steps: (dto.steps ?? []) as object[],
      },
    });
    await this.audit.record(workspaceId, actor, "sequence.create", row.id);
    return mapSequence(row, 0);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateSequenceDto): Promise<Sequence> {
    const existing = await this.db().sequence.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Secuencia no encontrada.");
    const row = await this.prisma.sequence.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        steps: dto.steps ? (dto.steps as object[]) : undefined,
      },
    });
    await this.audit.record(workspaceId, actor, "sequence.update", id);
    return mapSequence(row, await this.countActive(id));
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().sequence.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Secuencia no encontrada.");
    await this.audit.record(workspaceId, actor, "sequence.delete", id);
  }

  async preview(workspaceId: string, id: string): Promise<SequencePreviewStep[]> {
    const seq = await this.db().sequence.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!seq) throw new NotFoundException("Secuencia no encontrada.");
    return previewSchedule((seq.steps as unknown as SequenceStep[]) ?? []);
  }

  async enrollments(workspaceId: string, id: string): Promise<SequenceEnrollment[]> {
    const seq = await this.db().sequence.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!seq) throw new NotFoundException("Secuencia no encontrada.");
    const rows = await this.prisma.sequenceEnrollment.findMany({
      where: { sequenceId: id },
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
    });
    return rows.map(mapSequenceEnrollment);
  }

  /** Enroll one contact or everyone with a tag. Dedupes by (sequence, contact). */
  async enroll(
    workspaceId: string,
    actor: string,
    id: string,
    input: EnrollDto,
  ): Promise<SequenceEnrollResult> {
    const seq = await this.db().sequence.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!seq) throw new NotFoundException("Secuencia no encontrada.");
    const steps = (seq.steps as unknown as SequenceStep[]) ?? [];

    const contacts = input.contactId
      ? await this.prisma.contact.findMany({ where: { id: input.contactId, workspaceSlug: workspaceId } })
      : input.tag
        ? await this.prisma.contact.findMany({ where: { workspaceSlug: workspaceId, tags: { has: input.tag } } })
        : [];

    const now = new Date();
    const firstRun = steps.length > 0 ? addDays(now, Math.max(0, steps[0]!.delayDays)) : null;
    let enrolled = 0;
    let skipped = 0;
    for (const c of contacts) {
      const existing = await this.prisma.sequenceEnrollment.findUnique({
        where: { sequenceId_contactId: { sequenceId: id, contactId: c.id } },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await this.prisma.sequenceEnrollment.create({
        data: {
          workspaceSlug: workspaceId,
          sequenceId: id,
          contactId: c.id,
          contactName: c.name,
          stepIndex: 0,
          status: steps.length > 0 ? "active" : "completed",
          nextRunAt: firstRun,
        },
      });
      enrolled++;
    }
    await this.audit.record(workspaceId, actor, "sequence.enroll", id);
    return { enrolled, skipped };
  }

  /**
   * The drip engine tick: send the due step for each active enrollment, advance
   * to the next step (scheduling its send) or complete. Dispatch is enqueued via
   * the OutboundDispatcher (the actual provider send needs credentials). Returns
   * how many enrollments were advanced. Idempotent per due-time.
   */
  async processDue(now: Date): Promise<{ processed: number }> {
    if (!this.prisma.enabled) return { processed: 0 };
    const due = await this.prisma.sequenceEnrollment.findMany({
      where: { status: "active", nextRunAt: { lte: now } },
      take: DUE_BATCH,
    });

    let processed = 0;
    const seqCache = new Map<string, SequenceStep[] | null>();
    for (const e of due) {
      let steps = seqCache.get(e.sequenceId);
      if (steps === undefined) {
        const seq = await this.prisma.sequence.findUnique({ where: { id: e.sequenceId } });
        // A paused sequence holds its enrollments (null = skip this tick).
        steps = seq && seq.status !== "paused" ? ((seq.steps as unknown as SequenceStep[]) ?? []) : null;
        seqCache.set(e.sequenceId, steps);
      }
      if (!steps) continue;

      const step = steps[e.stepIndex];
      if (step) {
        const contact = await this.prisma.contact.findUnique({ where: { id: e.contactId } });
        const to = contact ? recipientFor(step.channel, contact) : null;
        if (to) {
          try {
            await this.dispatcher.dispatchMessage(e.workspaceSlug, step.channel, to, step.body);
          } catch (err) {
            this.logger.warn(`Secuencia ${e.sequenceId}: envío falló: ${(err as Error).message}`);
          }
        }
      }

      const nextIndex = e.stepIndex + 1;
      const nextStep = steps[nextIndex];
      await this.prisma.sequenceEnrollment.update({
        where: { id: e.id },
        data: nextStep
          ? { stepIndex: nextIndex, nextRunAt: addDays(now, Math.max(0, nextStep.delayDays)) }
          : { stepIndex: nextIndex, status: "completed", nextRunAt: null },
      });
      processed++;
    }
    if (processed > 0) this.logger.log(`Secuencias: ${processed} envío(s) procesados.`);
    return { processed };
  }
}

@ApiTags("sequences")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/sequences")
export class SequencesController {
  constructor(private readonly service: SequencesService) {}

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
    @Body() dto: CreateSequenceDto,
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
    @Body() dto: UpdateSequenceDto,
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

  @Get(":id/preview")
  preview(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.preview(workspaceId, id);
  }

  @Get(":id/enrollments")
  enrollmentsList(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.enrollments(workspaceId, id);
  }

  @Post(":id/enroll")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  enroll(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: EnrollDto,
  ) {
    return this.service.enroll(workspaceId, user.email, id, dto);
  }

  /** Manually run the drip engine now (ops/testing); also runs on a timer. */
  @Post("run-due")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  runDue() {
    return this.service.processDue(new Date());
  }
}

@Module({
  imports: [ProvidersModule],
  controllers: [SequencesController],
  providers: [SequencesService],
})
export class SequencesModule {}
