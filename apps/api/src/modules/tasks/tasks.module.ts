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
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@nv/domain";
import type { Task as TaskRow } from "@prisma/client";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { NotificationsModule, NotificationsService } from "../notifications/notifications.module";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthStore } from "../../auth/auth.store";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";

/** Hard cap on one board; far above what a team keeps open at once. */
export const TASKS_LIMIT = 500;

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: TaskStatus;
  @IsOptional() @IsIn(TASK_PRIORITIES) priority?: TaskPriority;
  @IsOptional() @IsString() @MaxLength(320) assignee?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(64) contactId?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: TaskStatus;
  @IsOptional() @IsIn(TASK_PRIORITIES) priority?: TaskPriority;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(320)
  assignee?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsDateString()
  dueAt?: string | null;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) position?: number;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(64)
  contactId?: string | null;
}

/** `contactName` present means the linked contact still exists in the workspace. */
export function mapTask(row: TaskRow, contactName?: string): Task {
  const contact = row.contactId && contactName !== undefined ? { contactId: row.contactId, contactName } : {};
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignee: row.assignee ?? undefined,
    dueAt: row.dueAt?.toISOString(),
    position: row.position,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    ...contact,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AuthStore,
    private readonly audit: AuditLogger,
    private readonly notifications: NotificationsService,
  ) {}

  private requireDb(): void {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
  }

  /** Tasks may only be assigned to people who belong to the workspace. */
  private async checkAssignee(workspaceId: string, email: string): Promise<string> {
    const wanted = email.trim().toLowerCase();
    const members = await this.store.listWorkspaceMembers(workspaceId);
    const member = members.find((m) => m.user.email.toLowerCase() === wanted);
    if (!member) throw new BadRequestException("El responsable no es miembro de este workspace.");
    return member.user.email;
  }

  /** A task may only point at a contact of the same workspace. Returns its name. */
  private async checkContact(workspaceId: string, contactId: string): Promise<string> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceSlug: workspaceId },
      select: { name: true },
    });
    if (!contact) throw new BadRequestException("El contacto no existe en este workspace.");
    return contact.name;
  }

  /** Names of the linked contacts that still exist, by id. */
  private async contactNames(workspaceId: string, rows: TaskRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const contacts = await this.prisma.contact.findMany({
      where: { workspaceSlug: workspaceId, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(contacts.map((c) => [c.id, c.name]));
  }

  /** Tell a member a task was assigned to them, unless they did it themselves. */
  private async noticeAssignment(workspaceId: string, actor: string, task: TaskRow): Promise<void> {
    if (!task.assignee || task.assignee.toLowerCase() === actor.toLowerCase()) return;
    const due = task.dueAt ? ` · vence ${task.dueAt.toISOString().slice(0, 10)}` : "";
    await this.notifications.create(workspaceId, {
      type: "info",
      title: `Te asignaron una tarea: ${task.title}`,
      meta: `Asignada por ${actor}${due}`,
      recipient: task.assignee,
    });
  }

  /** Next position at the bottom of a column. */
  private async bottomOf(workspaceId: string, status: TaskStatus): Promise<number> {
    const last = await this.prisma.task.findFirst({
      where: { workspaceSlug: workspaceId, status },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return (last?.position ?? 0) + 1;
  }

  async list(workspaceId: string): Promise<Task[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.task.findMany({
      where: { workspaceSlug: workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: TASKS_LIMIT,
    });
    const names = await this.contactNames(workspaceId, rows);
    return rows.map((r) => mapTask(r, r.contactId ? names.get(r.contactId) : undefined));
  }

  async create(workspaceId: string, actor: string, dto: CreateTaskDto): Promise<Task> {
    this.requireDb();
    const count = await this.prisma.task.count({ where: { workspaceSlug: workspaceId } });
    if (count >= TASKS_LIMIT) {
      throw new BadRequestException(`El tablero admite hasta ${TASKS_LIMIT} tareas. Elimina las terminadas.`);
    }
    const status = dto.status ?? "todo";
    const assignee = dto.assignee?.trim() ? await this.checkAssignee(workspaceId, dto.assignee) : null;
    const contactId = dto.contactId?.trim() || null;
    const contactName = contactId ? await this.checkContact(workspaceId, contactId) : undefined;
    const row = await this.prisma.task.create({
      data: {
        workspaceSlug: workspaceId,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? "",
        status,
        priority: dto.priority ?? "normal",
        assignee,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        position: await this.bottomOf(workspaceId, status),
        createdBy: actor,
        completedAt: status === "done" ? new Date() : null,
        contactId,
      },
    });
    await this.audit.record(workspaceId, actor, "task.create", row.title);
    await this.noticeAssignment(workspaceId, actor, row);
    return mapTask(row, contactName);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    this.requireDb();
    const current = await this.prisma.task.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!current) throw new NotFoundException("Tarea no encontrada.");

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException("El título no puede quedar vacío.");
      data.title = title;
    }
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assignee !== undefined) {
      data.assignee = dto.assignee && dto.assignee.trim() ? await this.checkAssignee(workspaceId, dto.assignee) : null;
    }
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.status !== undefined && dto.status !== current.status) {
      data.status = dto.status;
      data.completedAt = dto.status === "done" ? new Date() : null;
      // A card moved without an explicit slot lands at the bottom of its new column.
      if (dto.position === undefined) data.position = await this.bottomOf(workspaceId, dto.status);
    }
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.contactId !== undefined) {
      data.contactId = dto.contactId && dto.contactId.trim() ? dto.contactId.trim() : null;
      if (data.contactId) await this.checkContact(workspaceId, data.contactId as string);
    }

    const row = await this.prisma.task.update({ where: { id: current.id }, data });
    if (data.status) await this.audit.record(workspaceId, actor, `task.${row.status}`, row.title);
    if (row.assignee && row.assignee !== current.assignee) await this.noticeAssignment(workspaceId, actor, row);
    const names = await this.contactNames(workspaceId, [row]);
    return mapTask(row, row.contactId ? names.get(row.contactId) : undefined);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    this.requireDb();
    const { count } = await this.prisma.task.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Tarea no encontrada.");
    await this.audit.record(workspaceId, actor, "task.delete", id);
  }
}

@ApiTags("tasks")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/tasks")
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }

  @Delete(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  remove(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.remove(workspaceId, user.email, id);
  }
}

@Module({ imports: [NotificationsModule], controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
