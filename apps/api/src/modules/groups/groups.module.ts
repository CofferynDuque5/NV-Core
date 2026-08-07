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
  Patch,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { CHANNEL_IDS, type ChannelId, type Group } from "@nv/domain";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapGroup } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { LIST_CAP } from "../../common/query-limits";

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ enum: CHANNEL_IDS })
  @IsOptional()
  @IsIn(CHANNEL_IDS)
  channel?: ChannelId;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  members?: number;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(CHANNEL_IDS) channel?: ChannelId;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsInt() @Min(0) members?: number;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Group>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Group>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.group.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.group.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapGroup), total);
  }

  async create(workspaceId: string, actor: string, dto: CreateGroupDto): Promise<Group> {
    const row = await this.db().group.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        channel: dto.channel ?? "wa",
        description: dto.description,
        tags: dto.tags ?? [],
        members: dto.members ?? 0,
      },
    });
    await this.audit.record(workspaceId, actor, "group.create", row.id);
    return mapGroup(row);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateGroupDto): Promise<Group> {
    const existing = await this.db().group.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Grupo no encontrado.");
    const row = await this.prisma.group.update({ where: { id }, data: dto });
    await this.audit.record(workspaceId, actor, "group.update", id);
    return mapGroup(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().group.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Grupo no encontrado.");
    await this.audit.record(workspaceId, actor, "group.delete", id);
  }

  /** Per-group merge variables as a flat { key: value } map. */
  async getVars(workspaceId: string, id: string): Promise<Record<string, string>> {
    const group = await this.db().group.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!group) throw new NotFoundException("Grupo no encontrado.");
    const rows = await this.prisma.groupVariable.findMany({ where: { groupId: id } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Replace the whole set of variables for a group. */
  async setVars(
    workspaceId: string,
    id: string,
    vars: Record<string, string>,
  ): Promise<Record<string, string>> {
    const group = await this.db().group.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!group) throw new NotFoundException("Grupo no encontrado.");
    const entries = Object.entries(vars ?? {}).filter(([k]) => k.trim());
    await this.prisma.$transaction([
      this.prisma.groupVariable.deleteMany({ where: { groupId: id } }),
      ...(entries.length
        ? [
            this.prisma.groupVariable.createMany({
              data: entries.map(([key, value]) => ({
                workspaceSlug: workspaceId,
                groupId: id,
                key: key.trim(),
                value: String(value ?? ""),
              })),
            }),
          ]
        : []),
    ]);
    return Object.fromEntries(entries.map(([k, v]) => [k.trim(), String(v ?? "")]));
  }
}

@ApiTags("groups")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/groups")
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id/vars")
  getVars(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.getVars(workspaceId, id);
  }

  @Put(":id/vars")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  setVars(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() vars: Record<string, string>,
  ) {
    return this.service.setVars(workspaceId, id, vars);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupDto,
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
    @Body() dto: UpdateGroupDto,
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

@Module({ controllers: [GroupsController], providers: [GroupsService] })
export class GroupsModule {}
