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
import type { Design, DesignFormat } from "@nv/domain";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapDesign } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

const FORMATS: DesignFormat[] = ["square", "portrait", "story", "landscape"];
const LAYER_TYPES = ["text", "rect", "button", "image"];

// Nested layer DTO — explicit @ValidateNested + @Type so the global
// ValidationPipe validates the shape without stripping the JSON.
export class DesignLayerDto {
  @IsString() id!: string;
  @IsIn(LAYER_TYPES) type!: string;
  @IsNumber() x!: number;
  @IsNumber() y!: number;
  @IsNumber() w!: number;
  @IsNumber() h!: number;

  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsNumber() fontSize?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(["left", "center", "right"]) align?: "left" | "center" | "right";
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsString() fill?: string;
  @IsOptional() @IsNumber() radius?: number;
  @IsOptional() @IsString() src?: string;
}

export class CreateDesignDto {
  @IsString() @MinLength(1) name!: string;

  @ApiPropertyOptional({ enum: FORMATS })
  @IsOptional()
  @IsIn(FORMATS)
  format?: DesignFormat;

  @ApiPropertyOptional({ type: [DesignLayerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesignLayerDto)
  layers?: DesignLayerDto[];
}

export class UpdateDesignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: FORMATS })
  @IsOptional()
  @IsIn(FORMATS)
  format?: DesignFormat;

  @ApiPropertyOptional({ type: [DesignLayerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesignLayerDto)
  layers?: DesignLayerDto[];
}

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Design>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Design>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.design.findMany({ where, orderBy: { updatedAt: "desc" } }),
      this.prisma.design.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapDesign), total);
  }

  async get(workspaceId: string, id: string): Promise<Design | null> {
    if (!this.prisma.enabled) return null;
    const row = await this.prisma.design.findFirst({ where: { id, workspaceSlug: workspaceId } });
    return row ? mapDesign(row) : null;
  }

  async create(workspaceId: string, actor: string, dto: CreateDesignDto): Promise<Design> {
    const row = await this.db().design.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        format: dto.format ?? "square",
        layers: (dto.layers ?? []) as object[],
      },
    });
    await this.audit.record(workspaceId, actor, "design.create", row.id);
    return mapDesign(row);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateDesignDto): Promise<Design> {
    const existing = await this.db().design.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Diseño no encontrado.");
    const row = await this.db().design.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.layers !== undefined ? { layers: dto.layers as object[] } : {}),
      },
    });
    await this.audit.record(workspaceId, actor, "design.update", id);
    return mapDesign(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().design.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Diseño no encontrado.");
    await this.audit.record(workspaceId, actor, "design.delete", id);
  }
}

@ApiTags("designs")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/designs")
export class DesignsController {
  constructor(private readonly service: DesignsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDesignDto,
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
    @Body() dto: UpdateDesignDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }

  @Delete(":id")
  @Roles("Owner", "Admin", "Editor")
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

@Module({ controllers: [DesignsController], providers: [DesignsService] })
export class DesignsModule {}
