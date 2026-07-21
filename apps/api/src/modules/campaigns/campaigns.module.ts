import { Controller, Get, Injectable, Module, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Campaign } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapCampaign } from "../../prisma/mappers";

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ListResultDto<Campaign>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Campaign>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { posts: true } } },
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapCampaign), total);
  }

  async get(workspaceId: string, id: string): Promise<Campaign | null> {
    if (!this.prisma.enabled) return null;
    const row = await this.prisma.campaign.findFirst({
      where: { id, workspaceSlug: workspaceId },
      include: { _count: { select: { posts: true } } },
    });
    return row ? mapCampaign(row) : null;
  }
}

@ApiTags("campaigns")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/campaigns")
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
  }
}

@Module({ controllers: [CampaignsController], providers: [CampaignsService] })
export class CampaignsModule {}
