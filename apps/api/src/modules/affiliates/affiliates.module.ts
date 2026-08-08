import { randomBytes } from "node:crypto";

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
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import type { Affiliate, AffiliateEvent } from "@nv/domain";
import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapAffiliate, mapAffiliateEvent } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { Public } from "../../auth/decorators/public.decorator";
import { LIST_CAP } from "../../common/query-limits";

/** Slugify a name into a URL-safe code stem. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "ref"
  );
}

export class CreateAffiliateDto {
  @IsString() @MinLength(1) name!: string;
  @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) commissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() destinationUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: "active" | "paused";
}

export class UpdateAffiliateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @IsString() destinationUrl?: string;
  @IsOptional() @IsString() status?: "active" | "paused";
}

export class ConvertDto {
  @IsNumber() @Min(0.01) amount!: number;
}

@Injectable()
export class AffiliatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Affiliate>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Affiliate>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.affiliate.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
      this.prisma.affiliate.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapAffiliate), total);
  }

  /** A referral code that isn't taken yet (globally unique). */
  private async uniqueCode(stem: string): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `${stem}-${randomBytes(2).toString("hex")}`;
      const clash = await this.prisma.affiliate.findUnique({ where: { code } });
      if (!clash) return code;
    }
    return `${stem}-${randomBytes(4).toString("hex")}`;
  }

  async create(workspaceId: string, actor: string, dto: CreateAffiliateDto): Promise<Affiliate> {
    const stem = dto.code ? slugify(dto.code) : slugify(dto.name);
    const code = await this.uniqueCode(stem);
    const row = await this.db().affiliate.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        email: dto.email,
        code,
        commissionPct: dto.commissionPct ?? 20,
        destinationUrl: dto.destinationUrl,
        status: dto.status ?? "active",
      },
    });
    await this.audit.record(workspaceId, actor, "affiliate.create", row.id);
    return mapAffiliate(row);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateAffiliateDto): Promise<Affiliate> {
    const existing = await this.db().affiliate.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Afiliado no encontrado.");
    const row = await this.prisma.affiliate.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        commissionPct: dto.commissionPct,
        destinationUrl: dto.destinationUrl,
        status: dto.status,
      },
    });
    await this.audit.record(workspaceId, actor, "affiliate.update", id);
    return mapAffiliate(row);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().affiliate.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Afiliado no encontrado.");
    await this.audit.record(workspaceId, actor, "affiliate.delete", id);
  }

  /** Record a referred sale and credit the commission. */
  async convert(workspaceId: string, actor: string, id: string, amount: number): Promise<Affiliate> {
    const aff = await this.db().affiliate.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!aff) throw new NotFoundException("Afiliado no encontrado.");
    const commission = Math.round(amount * aff.commissionPct) / 100;
    const [row] = await this.prisma.$transaction([
      this.prisma.affiliate.update({
        where: { id },
        data: { conversions: { increment: 1 }, earnings: { increment: commission } },
      }),
      this.prisma.affiliateEvent.create({
        data: { affiliateId: id, type: "conversion", amount, commission },
      }),
    ]);
    await this.audit.record(workspaceId, actor, "affiliate.convert", id);
    return mapAffiliate(row);
  }

  async events(workspaceId: string, id: string): Promise<AffiliateEvent[]> {
    const aff = await this.db().affiliate.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!aff) throw new NotFoundException("Afiliado no encontrado.");
    const rows = await this.prisma.affiliateEvent.findMany({
      where: { affiliateId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapAffiliateEvent);
  }

  /** Public: count a click on a referral link and return where to redirect. */
  async trackClick(code: string): Promise<string> {
    const fallback = this.config.get("appUrl", { infer: true });
    if (!this.prisma.enabled) return fallback;
    const aff = await this.prisma.affiliate.findUnique({ where: { code } });
    if (!aff || aff.status !== "active") return fallback;
    await this.prisma.$transaction([
      this.prisma.affiliate.update({ where: { id: aff.id }, data: { clicks: { increment: 1 } } }),
      this.prisma.affiliateEvent.create({ data: { affiliateId: aff.id, type: "click" } }),
    ]);
    return aff.destinationUrl || fallback;
  }
}

@ApiTags("affiliates")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/affiliates")
export class AffiliatesController {
  constructor(private readonly service: AffiliatesService) {}

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
    @Body() dto: CreateAffiliateDto,
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
    @Body() dto: UpdateAffiliateDto,
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

  @Get(":id/events")
  events(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.events(workspaceId, id);
  }

  @Post(":id/convert")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  convert(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ConvertDto,
  ) {
    return this.service.convert(workspaceId, user.email, id, dto.amount);
  }
}

/** Public referral link: counts the click and redirects to the destination. */
@ApiTags("affiliates")
@Public()
@Controller("r")
export class ReferralController {
  constructor(private readonly service: AffiliatesService) {}

  @Get(":code")
  @Redirect()
  async track(@Param("code") code: string) {
    const url = await this.service.trackClick(code);
    return { url, statusCode: 302 };
  }
}

@Module({
  controllers: [AffiliatesController, ReferralController],
  providers: [AffiliatesService],
})
export class AffiliatesModule {}
