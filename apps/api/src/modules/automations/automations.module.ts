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
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import type { Automation, AutomationNode } from "@nv/domain";
import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapAutomation } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

export class CreateAutomationDto {
  @IsString() @MinLength(1) name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ["activo", "pausado"] })
  @IsOptional()
  @IsIn(["activo", "pausado"])
  status?: "activo" | "pausado";

  @ApiPropertyOptional({ type: "array", items: { type: "object" } })
  @IsOptional()
  @IsArray()
  nodes?: AutomationNode[];
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Automation>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Automation>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.automation.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.automation.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapAutomation), total);
  }

  async create(workspaceId: string, actor: string, dto: CreateAutomationDto): Promise<Automation> {
    const row = await this.db().automation.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        description: dto.description,
        status: dto.status ?? "pausado",
        nodes: (dto.nodes ?? []) as object[],
      },
    });
    await this.audit.record(workspaceId, actor, "automation.create", row.id);
    return mapAutomation(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().automation.deleteMany({
      where: { id, workspaceSlug: workspaceId },
    });
    if (count === 0) throw new NotFoundException("Automatización no encontrada.");
    await this.audit.record(workspaceId, actor, "automation.delete", id);
  }
}

@ApiTags("automations")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/automations")
export class AutomationsController {
  constructor(private readonly service: AutomationsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Post()
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAutomationDto,
  ) {
    return this.service.create(workspaceId, user.email, dto);
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

@Module({ controllers: [AutomationsController], providers: [AutomationsService] })
export class AutomationsModule {}
