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
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { CONTACT_STAGES, type Contact, type ContactStage } from "@nv/domain";
import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapContact } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: CONTACT_STAGES })
  @IsOptional()
  @IsIn(CONTACT_STAGES)
  stage?: ContactStage;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsIn(CONTACT_STAGES) stage?: ContactStage;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException("Base de datos no configurada.");
    }
    return this.prisma;
  }

  async list(workspaceId: string, query: PaginationQueryDto): Promise<ListResultDto<Contact>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Contact>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapContact), total);
  }

  async create(workspaceId: string, actor: string, dto: CreateContactDto): Promise<Contact> {
    const row = await this.db().contact.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        company: dto.company,
        tags: dto.tags ?? [],
        stage: dto.stage ?? "Lead",
      },
    });
    await this.audit.record(workspaceId, actor, "contact.create", row.id);
    return mapContact(row);
  }

  async update(
    workspaceId: string,
    actor: string,
    id: string,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    const existing = await this.db().contact.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Contacto no encontrado.");
    const row = await this.prisma.contact.update({ where: { id }, data: dto });
    await this.audit.record(workspaceId, actor, "contact.update", id);
    return mapContact(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().contact.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Contacto no encontrado.");
    await this.audit.record(workspaceId, actor, "contact.delete", id);
  }
}

@ApiTags("contacts")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/contacts")
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query() query: PaginationQueryDto) {
    return this.service.list(workspaceId, query);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactDto,
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
    @Body() dto: UpdateContactDto,
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

@Module({ controllers: [ContactsController], providers: [ContactsService] })
export class ContactsModule {}
