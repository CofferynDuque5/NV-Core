import {
  Controller,
  DefaultValuePipe,
  Get,
  Injectable,
  Module,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  CONTACT_STAGES,
  type AnalyticsPoint,
  type AnalyticsSnapshot,
  type ChannelId,
  type FunnelStep,
  type KpiMetric,
} from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapCampaign } from "../../prisma/mappers";

const DAY_MS = 86_400_000;
const ALLOWED_DAYS = [7, 30, 90];
const FUNNEL_ACCENTS = ["#5B8DEF", "#7C7CF0", "#3FB950", "#E3B341", "#F85149"];
const STAGE_ACCENT: Record<string, string> = {
  Lead: "#5B8DEF",
  Cliente: "#3FB950",
  "En riesgo": "#E3B341",
  Inactivo: "#8A93A0",
};

/** UTC day key (YYYY-MM-DD) — stable across server timezones. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Period-over-period delta as a signed percent + trend, for a KPI badge. */
function delta(current: number, previous: number): Pick<KpiMetric, "delta" | "deltaTrend"> {
  if (previous === 0) {
    if (current === 0) return { delta: "0%", deltaTrend: "up" };
    return { delta: "+100%", deltaTrend: "up" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return { delta: `${pct >= 0 ? "+" : ""}${pct}%`, deltaTrend: pct >= 0 ? "up" : "down" };
}

/** Bucket a list of dates into a continuous day-indexed count map. */
function bucketByDay(dates: Date[], from: Date, days: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) map.set(dayKey(new Date(from.getTime() + i * DAY_MS)), 0);
  for (const d of dates) {
    const k = dayKey(d);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Real aggregates from the workspace's own data over a reporting window
   * (no fabricated metrics). `days` selects the window (7/30/90, default 30);
   * KPIs compare it against the immediately preceding window of equal length.
   */
  async snapshot(workspaceSlug: string, days = 30): Promise<AnalyticsSnapshot | null> {
    if (!this.prisma.enabled) return null;

    const window = ALLOWED_DAYS.includes(days) ? days : 30;
    const to = new Date();
    const from = new Date(to.getTime() - window * DAY_MS);
    const prevFrom = new Date(from.getTime() - window * DAY_MS);
    const where = { workspaceSlug };
    const cur = { gte: from, lt: to };
    const prev = { gte: prevFrom, lt: from };
    const msgWhere = (range: { gte: Date; lt: Date }) => ({
      conversation: { workspaceSlug },
      createdAt: range,
    });

    const [
      // Current-window rows (also feed the time-series / heatmap / platforms).
      postRows,
      contactRows,
      conversationRows,
      messageRows,
      campaignsNew,
      // Previous-window counts (for deltas).
      prevPosts,
      prevContacts,
      prevConversations,
      prevMessages,
      prevCampaigns,
      // All-time distributions / rates.
      byStage,
      totalContacts,
      postsSent,
      postsAll,
      campaignsActive,
      campaignsTotal,
      campaignRows,
    ] = await Promise.all([
      this.prisma.post.findMany({ where: { ...where, createdAt: cur }, select: { createdAt: true, channel: true } }),
      this.prisma.contact.findMany({ where: { ...where, createdAt: cur }, select: { createdAt: true } }),
      this.prisma.conversation.findMany({ where: { ...where, createdAt: cur }, select: { createdAt: true } }),
      this.prisma.message.findMany({ where: msgWhere(cur), select: { createdAt: true } }),
      this.prisma.campaign.count({ where: { ...where, createdAt: cur } }),
      this.prisma.post.count({ where: { ...where, createdAt: prev } }),
      this.prisma.contact.count({ where: { ...where, createdAt: prev } }),
      this.prisma.conversation.count({ where: { ...where, createdAt: prev } }),
      this.prisma.message.count({ where: msgWhere(prev) }),
      this.prisma.campaign.count({ where: { ...where, createdAt: prev } }),
      this.prisma.contact.groupBy({ by: ["stage"], where, _count: true }),
      this.prisma.contact.count({ where }),
      this.prisma.post.count({ where: { ...where, status: "sent" } }),
      this.prisma.post.count({ where }),
      this.prisma.campaign.count({ where: { ...where, status: "activa" } }),
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({ where, include: { _count: { select: { posts: true } } } }),
    ]);

    // ── KPIs (windowed, period-over-period deltas) ──────────────────────────
    const kpis: KpiMetric[] = [
      { label: "Contactos nuevos", value: String(contactRows.length), ...delta(contactRows.length, prevContacts) },
      { label: "Publicaciones", value: String(postRows.length), ...delta(postRows.length, prevPosts) },
      { label: "Conversaciones", value: String(conversationRows.length), ...delta(conversationRows.length, prevConversations) },
      { label: "Mensajes", value: String(messageRows.length), ...delta(messageRows.length, prevMessages) },
      { label: "Campañas nuevas", value: String(campaignsNew), ...delta(campaignsNew, prevCampaigns) },
    ];

    // ── Time-series (continuous daily buckets) ──────────────────────────────
    const postBuckets = bucketByDay(postRows.map((r) => r.createdAt), from, window);
    const contactBuckets = bucketByDay(contactRows.map((r) => r.createdAt), from, window);
    const convBuckets = bucketByDay(conversationRows.map((r) => r.createdAt), from, window);
    const msgBuckets = bucketByDay(messageRows.map((r) => r.createdAt), from, window);
    const series: AnalyticsPoint[] = [...postBuckets.keys()].map((date) => ({
      date,
      posts: postBuckets.get(date) ?? 0,
      contacts: contactBuckets.get(date) ?? 0,
      conversations: convBuckets.get(date) ?? 0,
      messages: msgBuckets.get(date) ?? 0,
    }));

    // ── Channel share (within the window) ───────────────────────────────────
    const channelCounts = new Map<ChannelId, number>();
    for (const p of postRows) channelCounts.set(p.channel, (channelCounts.get(p.channel) ?? 0) + 1);
    const platforms = [...channelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([channel, count]) => ({
        channel,
        count,
        pct: postRows.length > 0 ? `${Math.round((count / postRows.length) * 100)}%` : "0%",
      }));

    // ── Funnel by CRM stage (canonical order, all-time) ─────────────────────
    const stageCount = new Map<string, number>();
    for (const s of byStage) stageCount.set(s.stage, s._count);
    const maxStage = Math.max(1, ...byStage.map((s) => s._count));
    const funnel: FunnelStep[] = CONTACT_STAGES.filter((s) => (stageCount.get(s) ?? 0) > 0).map(
      (stage, i) => ({
        label: stage,
        value: String(stageCount.get(stage) ?? 0),
        pct: Math.round(((stageCount.get(stage) ?? 0) / maxStage) * 100),
        accent: STAGE_ACCENT[stage] ?? FUNNEL_ACCENTS[i % FUNNEL_ACCENTS.length]!,
      }),
    );

    // ── Conversion / engagement rates (honest ratios from real data) ────────
    const clientes = stageCount.get("Cliente") ?? 0;
    const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
    const conversion: FunnelStep[] = [
      { label: "Conversión (Cliente)", value: `${rate(clientes, totalContacts)}%`, pct: rate(clientes, totalContacts), accent: "#3FB950" },
      { label: "Entrega de posts", value: `${rate(postsSent, postsAll)}%`, pct: rate(postsSent, postsAll), accent: "#5B8DEF" },
      { label: "Campañas activas", value: `${rate(campaignsActive, campaignsTotal)}%`, pct: rate(campaignsActive, campaignsTotal), accent: "#7C7CF0" },
    ];

    // ── Activity heatmap (weekday × hour, UTC, from messages) ───────────────
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const m of messageRows) {
      const d = m.createdAt;
      heatmap[d.getUTCDay()]![d.getUTCHours()]! += 1;
    }

    // ── Top campaigns by number of posts ────────────────────────────────────
    const topCampaigns = campaignRows
      .sort((a, b) => (b._count?.posts ?? 0) - (a._count?.posts ?? 0))
      .slice(0, 5)
      .map(mapCampaign);

    return {
      kpis,
      funnel,
      platforms,
      heatmap,
      topCampaigns,
      series,
      conversion,
      range: { days: window, from: from.toISOString(), to: to.toISOString() },
    };
  }
}

@ApiTags("analytics")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/analytics")
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  @ApiQuery({ name: "days", required: false, enum: ALLOWED_DAYS })
  snapshot(
    @WorkspaceId() workspaceId: string,
    @Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.service.snapshot(workspaceId, days);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
