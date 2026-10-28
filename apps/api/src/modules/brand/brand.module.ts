import { Body, Controller, Get, Injectable, Module, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { BrandLinks } from "@nv/domain";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";

export class SocialLinkDto {
  @IsString() @MaxLength(40) label!: string;
  @IsString() @MaxLength(300) url!: string;
}

export class BrandLinksDto {
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks!: SocialLinkDto[];

  @IsOptional() @IsString() @MaxLength(300) website?: string | null;
}

/** "instagram.com/x" → "https://instagram.com/x"; "@x" and plain text stay as typed. */
export function normalizeLink(raw: string): string {
  const v = raw.trim();
  if (!v || /^https?:\/\//i.test(v) || v.startsWith("@") || !/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return v;
  return `https://${v}`;
}

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  async get(workspaceSlug: string): Promise<BrandLinks> {
    if (!this.prisma.enabled) return { socialLinks: [], website: null };
    const row = await this.prisma.workspaceSettings.findUnique({ where: { workspaceSlug } });
    return {
      socialLinks: (row?.socialLinks as BrandLinks["socialLinks"] | null) ?? [],
      website: row?.website ?? null,
    };
  }

  async set(workspaceSlug: string, actor: string, dto: BrandLinksDto): Promise<BrandLinks> {
    const socialLinks = dto.socialLinks
      .map((s) => ({ label: s.label.trim(), url: normalizeLink(s.url) }))
      .filter((s) => s.url);
    const website = dto.website ? normalizeLink(dto.website) || null : null;
    await this.prisma.workspaceSettings.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, socialLinks, website, updatedBy: actor },
      update: { socialLinks, website, updatedBy: actor },
    });
    await this.audit.record(workspaceSlug, actor, "brand.links", String(socialLinks.length));
    return { socialLinks, website };
  }
}

/** The brand's social links and website, shown at the end of group messages. */
@ApiTags("brand")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/brand-links")
export class BrandController {
  constructor(private readonly service: BrandService) {}

  @Get()
  get(@WorkspaceId() workspaceId: string) {
    return this.service.get(workspaceId);
  }

  @Put()
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  set(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: BrandLinksDto) {
    return this.service.set(workspaceId, user.email, dto);
  }
}

@Module({ controllers: [BrandController], providers: [BrandService] })
export class BrandModule {}
