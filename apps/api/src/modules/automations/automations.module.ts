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
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { AUTOMATION_NODE_TYPES } from "@nv/domain";
import type { Automation, AutomationNode, RunAutomationResult } from "@nv/domain";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

import type { AppConfig } from "../../config/configuration";
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
import { triggerWebhook } from "./n8n.client";
import { ProvidersModule } from "../../providers/providers.module";
import { AutomationBridgeController, N8nSecretGuard } from "./n8n.bridge";
import { N8nEventForwarder } from "./n8n.forwarder";

// Nested DTOs for the flow graph. Explicit @ValidateNested + @Type is required
// so the global ValidationPipe (whitelist + implicit conversion) validates the
// shape without stripping/mangling it. `config` is left untyped on purpose so
// its arbitrary per-node keys pass through untouched.
export class AutomationNodeDto {
  @IsString() id!: string;
  @IsIn(AUTOMATION_NODE_TYPES) type!: AutomationNode["type"];
  @IsString() label!: string;

  @IsOptional() @IsNumber() x?: number;
  @IsOptional() @IsNumber() y?: number;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class AutomationEdgeDto {
  @IsString() id!: string;
  @IsString() from!: string;
  @IsString() to!: string;
}

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

  @ApiPropertyOptional({ type: [AutomationNodeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationNodeDto)
  nodes?: AutomationNodeDto[];

  @ApiPropertyOptional({ type: [AutomationEdgeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationEdgeDto)
  edges?: AutomationEdgeDto[];

  @ApiPropertyOptional({ description: "Webhook de n8n (URL absoluta o path)." })
  @IsOptional()
  @IsString()
  webhookUrl?: string;
}

export class UpdateAutomationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ["activo", "pausado"] })
  @IsOptional()
  @IsIn(["activo", "pausado"])
  status?: "activo" | "pausado";

  @ApiPropertyOptional({ type: [AutomationNodeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationNodeDto)
  nodes?: AutomationNodeDto[];

  @ApiPropertyOptional({ type: [AutomationEdgeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationEdgeDto)
  edges?: AutomationEdgeDto[];

  @ApiPropertyOptional({ description: "Webhook de n8n (URL absoluta o path)." })
  @IsOptional()
  @IsString()
  webhookUrl?: string;
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly config: ConfigService<AppConfig, true>,
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
        edges: (dto.edges ?? []) as object[],
        webhookUrl: dto.webhookUrl,
      },
    });
    await this.audit.record(workspaceId, actor, "automation.create", row.id);
    return mapAutomation(row);
  }

  /** Persist the flow graph (nodes/edges) and metadata for the visual editor. */
  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateAutomationDto,
  ): Promise<Automation> {
    const existing = await this.db().automation.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    if (!existing) throw new NotFoundException("Automatización no encontrada.");

    const row = await this.db().automation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.nodes !== undefined ? { nodes: dto.nodes as object[] } : {}),
        ...(dto.edges !== undefined ? { edges: dto.edges as object[] } : {}),
        ...(dto.webhookUrl !== undefined ? { webhookUrl: dto.webhookUrl } : {}),
      },
    });
    await this.audit.record(workspaceId, actor, "automation.update", id);
    return mapAutomation(row);
  }

  /** Trigger the automation's n8n webhook and bump its run count. */
  async run(workspaceId: string, actor: string, id: string): Promise<RunAutomationResult> {
    const automation = await this.db().automation.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    if (!automation) throw new NotFoundException("Automatización no encontrada.");

    const n8n = this.config.get("integrations", { infer: true }).n8n;
    if (!automation.webhookUrl) {
      throw new ServiceUnavailableException(
        "Esta automatización no tiene un webhook de n8n configurado.",
      );
    }
    if (!n8n.baseUrl && !/^https?:\/\//i.test(automation.webhookUrl)) {
      throw new ServiceUnavailableException("n8n no configurado. Define N8N_BASE_URL.");
    }

    try {
      await triggerWebhook(n8n, automation.webhookUrl, {
        workspaceSlug: workspaceId,
        automationId: automation.id,
        automationName: automation.name,
        triggeredBy: actor,
        triggeredAt: new Date().toISOString(),
      });
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }

    const updated = await this.db().automation.update({
      where: { id },
      data: { runs: { increment: 1 } },
    });
    await this.audit.record(workspaceId, actor, "automation.run", id);
    return { triggered: true, runs: updated.runs };
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

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }

  @Post(":id/run")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  run(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.run(workspaceId, user.email, id);
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

@Module({
  imports: [ProvidersModule],
  controllers: [AutomationsController, AutomationBridgeController],
  providers: [AutomationsService, N8nSecretGuard, N8nEventForwarder],
})
export class AutomationsModule {}
