import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { ProviderManager } from "../../providers/provider-manager.service";
import { ProvidersModule } from "../../providers/providers.module";
import type { MediaAttachment } from "../../providers/provider.types";
import { MetaService } from "./meta.service";
import { MetaModule } from "./meta.module";

class PublishDto {
  @IsArray() @IsIn(["facebook", "instagram"], { each: true }) targets!: ("facebook" | "instagram")[];
  @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional({ isArray: true, type: Object })
  @IsOptional()
  @IsArray()
  attachments?: { url?: string; kind?: string; mime?: string | null; filename?: string | null }[];
  @IsOptional() @IsIn(["feed", "reel", "story", "carousel"]) format?: string;
}

@ApiTags("social")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/social")
export class SocialController {
  constructor(
    private readonly meta: MetaService,
    private readonly prisma: PrismaService,
    private readonly providers: ProviderManager,
  ) {}

  @Get("status")
  async status(@WorkspaceId() workspaceId: string) {
    // Provider-agnostic: report whether the ACTIVE adapter (Meta Graph or
    // Ayrshare) is configured for each network, so switching adapter in
    // Conexiones is reflected here without special-casing the transport. A
    // provider health check must never take the whole status endpoint down.
    const configured = async (provider: "facebook" | "instagram"): Promise<boolean> => {
      try {
        return (await this.providers.healthCheck(workspaceId, provider)).configured;
      } catch {
        return false;
      }
    };
    const [facebook, instagram] = await Promise.all([configured("facebook"), configured("instagram")]);
    return { facebook, instagram };
  }

  @Post("publish")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async publish(@WorkspaceId() workspaceId: string, @Body() dto: PublishDto) {
    if (!dto.targets?.length) throw new BadRequestException("Elige Facebook y/o Instagram.");
    // Every outbound publish goes through the ProviderManager (single entry).
    const results = [];
    for (const target of dto.targets) {
      const r = await this.providers.publish(workspaceId, target, {
        message: dto.message,
        attachments: dto.attachments?.filter((a) => a.url) as MediaAttachment[] | undefined,
        format: dto.format ?? null,
      });
      results.push({ target, ok: r.ok, id: r.id, format: r.format, error: r.error });
      if (this.prisma.enabled) {
        await this.prisma.sendLog.create({
          data: {
            workspaceSlug: workspaceId,
            campaignName: "Publicación directa",
            groupName: target === "facebook" ? "Facebook" : "Instagram",
            target,
            postId: r.id ?? null,
            format: r.format ?? dto.format ?? null,
            preview: (dto.message ?? "").slice(0, 140),
            ok: r.ok,
            error: r.error ?? null,
          },
        });
      }
    }
    return { results };
  }

  @Get("insights")
  insights(
    @WorkspaceId() workspaceId: string,
    @Query("target") target: string,
    @Query("id") id: string,
  ) {
    if ((target !== "facebook" && target !== "instagram") || !id) {
      throw new BadRequestException("Faltan parámetros: target (facebook|instagram) e id.");
    }
    return this.meta.getInsights(workspaceId, target, id);
  }
}

@Module({
  imports: [MetaModule, ProvidersModule],
  controllers: [SocialController],
})
export class SocialModule {}
