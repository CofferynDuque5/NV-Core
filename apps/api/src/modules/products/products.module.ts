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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { CampaignAttachment, Product } from "@nv/domain";
import type { Prisma, Product as ProductRow } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import { MediaAttachmentDto } from "../../common/dto/media-attachment.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { cleanPrices } from "../campaigns/campaigns.module";

const MAX_PRODUCTS = 2000;

export class CreateProductDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @IsObject() prices?: Record<string, string>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MediaAttachmentDto)
  images?: CampaignAttachment[];
  @IsOptional() @IsString() @MaxLength(60) sku?: string | null;
  @IsOptional() @IsInt() @Min(0) stock?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @IsObject() prices?: Record<string, string>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MediaAttachmentDto)
  images?: CampaignAttachment[];
  @IsOptional() @IsString() @MaxLength(60) sku?: string | null;
  @IsOptional() @IsInt() @Min(0) stock?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    prices: (row.prices as Record<string, string> | null) ?? {},
    images: (row.images as CampaignAttachment[] | null) ?? [],
    sku: row.sku,
    stock: row.stock,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

function productData(dto: UpdateProductDto): Prisma.ProductUpdateInput {
  return {
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(dto.description !== undefined ? { description: blankToNull(dto.description) } : {}),
    ...(dto.category !== undefined ? { category: blankToNull(dto.category) } : {}),
    ...(dto.prices !== undefined ? { prices: cleanPrices(dto.prices) ?? {} } : {}),
    ...(dto.images !== undefined ? { images: dto.images as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.sku !== undefined ? { sku: blankToNull(dto.sku) } : {}),
    ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
    ...(dto.active !== undefined ? { active: dto.active } : {}),
  };
}

/** The brand's catalog (Tienda): products, descriptions and prices per currency. */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private requireDb(): void {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
  }

  async list(workspaceSlug: string): Promise<Product[]> {
    this.requireDb();
    const rows = await this.prisma.product.findMany({
      where: { workspaceSlug },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: MAX_PRODUCTS,
    });
    return rows.map(mapProduct);
  }

  async create(workspaceSlug: string, actor: string, dto: CreateProductDto): Promise<Product> {
    this.requireDb();
    if ((await this.prisma.product.count({ where: { workspaceSlug } })) >= MAX_PRODUCTS) {
      throw new BadRequestException(`La Tienda admite hasta ${MAX_PRODUCTS} productos.`);
    }
    const row = await this.prisma.product.create({
      data: { ...(productData(dto) as Prisma.ProductCreateInput), workspaceSlug, name: dto.name.trim() },
    });
    await this.audit.record(workspaceSlug, actor, "product.create", row.id);
    return mapProduct(row);
  }

  async update(workspaceSlug: string, actor: string, id: string, dto: UpdateProductDto): Promise<Product> {
    this.requireDb();
    const { count } = await this.prisma.product.updateMany({
      where: { id, workspaceSlug },
      data: productData(dto) as Prisma.ProductUpdateManyMutationInput,
    });
    if (count === 0) throw new NotFoundException("Producto no encontrado.");
    await this.audit.record(workspaceSlug, actor, "product.update", id);
    return mapProduct((await this.prisma.product.findUnique({ where: { id } }))!);
  }

  async remove(workspaceSlug: string, actor: string, id: string): Promise<void> {
    this.requireDb();
    const { count } = await this.prisma.product.deleteMany({ where: { id, workspaceSlug } });
    if (count === 0) throw new NotFoundException("Producto no encontrado.");
    await this.audit.record(workspaceSlug, actor, "product.delete", id);
  }
}

@ApiTags("products")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/products")
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@WorkspaceId() ws: string) {
    return this.service.list(ws);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(@WorkspaceId() ws: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.service.create(ws, user.email, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() ws: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(ws, user.email, id, dto);
  }

  @Delete(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  remove(@WorkspaceId() ws: string, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.remove(ws, user.email, id);
  }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}
