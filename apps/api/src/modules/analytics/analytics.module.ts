import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AnalyticsSnapshot, ChannelId } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapCampaign } from "../../prisma/mappers";

const FUNNEL_ACCENTS = ["#5B8DEF", "#7C7CF0", "#3FB950", "#E3B341", "#F85149"];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Real aggregates from the workspace's own data (no fabricated metrics). */
  async snapshot(workspaceSlug: string): Promise<AnalyticsSnapshot | null> {
    if (!this.prisma.enabled) return null;
    const where = { workspaceSlug };

    const [contacts, campaignsTotal, campaignsActive, postsTotal, conversations, groups, templates] =
      await Promise.all([
        this.prisma.contact.count({ where }),
        this.prisma.campaign.count({ where }),
        this.prisma.campaign.count({ where: { ...where, status: "activa" } }),
        this.prisma.post.count({ where }),
        this.prisma.conversation.count({ where }),
        this.prisma.group.count({ where }),
        this.prisma.template.count({ where }),
      ]);

    // Posts by channel → platform share.
    const postsByChannel = await this.prisma.post.groupBy({
      by: ["channel"],
      where,
      _count: true,
    });
    const platforms = postsByChannel.map((g) => ({
      channel: g.channel as ChannelId,
      pct: postsTotal > 0 ? `${Math.round((g._count / postsTotal) * 100)}%` : "0%",
    }));

    // Contacts by stage → pipeline funnel.
    const byStage = await this.prisma.contact.groupBy({ by: ["stage"], where, _count: true });
    const maxStage = Math.max(1, ...byStage.map((s) => s._count));
    const funnel = byStage
      .sort((a, b) => b._count - a._count)
      .map((s, i) => ({
        label: s.stage,
        value: String(s._count),
        pct: Math.round((s._count / maxStage) * 100),
        accent: FUNNEL_ACCENTS[i % FUNNEL_ACCENTS.length]!,
      }));

    // Top campaigns by number of posts.
    const campaignRows = await this.prisma.campaign.findMany({
      where,
      include: { _count: { select: { posts: true } } },
    });
    const topCampaigns = campaignRows
      .sort((a, b) => (b._count?.posts ?? 0) - (a._count?.posts ?? 0))
      .slice(0, 5)
      .map(mapCampaign);

    const kpis = [
      { label: "Contactos", value: String(contacts) },
      { label: "Campañas", value: String(campaignsTotal) },
      { label: "Campañas activas", value: String(campaignsActive) },
      { label: "Publicaciones", value: String(postsTotal) },
      { label: "Conversaciones", value: String(conversations) },
      { label: "Grupos", value: String(groups) },
      { label: "Plantillas", value: String(templates) },
    ];

    return { kpis, funnel, platforms, heatmap: [], topCampaigns };
  }
}

@ApiTags("analytics")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/analytics")
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  snapshot(@WorkspaceId() workspaceId: string) {
    return this.service.snapshot(workspaceId);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
