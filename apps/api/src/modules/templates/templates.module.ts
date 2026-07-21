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
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import type { Template } from "@nv/domain";
import { IsOptional, IsString, MinLength } from "class-validator";

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

export class CreateTemplateDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
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
      this.prisma.template.findMany({ where, orderBy: { createdAt: "desc" } }),
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
