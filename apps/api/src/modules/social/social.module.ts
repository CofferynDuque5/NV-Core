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
import { MetaService } from "./meta.service";

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
  ) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.meta.status(workspaceId);
  }

  @Post("publish")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async publish(@WorkspaceId() workspaceId: string, @Body() dto: PublishDto) {
    if (!dto.targets?.length) throw new BadRequestException("Elige Facebook y/o Instagram.");
    const results = await this.meta.publish(workspaceId, dto.targets, {
      message: dto.message,
      attachments: dto.attachments,
      format: dto.format ?? null,
    });
    if (this.prisma.enabled) {
      for (const r of results) {
        await this.prisma.sendLog.create({
          data: {
            workspaceSlug: workspaceId,
            campaignName: "Publicación directa",
            groupName: r.target === "facebook" ? "Facebook" : "Instagram",
            target: r.target,
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
  controllers: [SocialController],
  providers: [MetaService],
  exports: [MetaService],
})
export class SocialModule {}
