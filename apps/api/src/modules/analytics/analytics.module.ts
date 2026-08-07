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

import { Prisma } from "@prisma/client";

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

/** A `{ day, n }` row from a date_trunc GROUP BY, as a lookup map. */
function dailyMap(rows: { day: string; n: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.day, Number(r.n));
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
      // Current-window counts (aggregated in the DB).
      curPosts,
      curContacts,
      curConversations,
      curMessages,
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
      // Channel share (window), grouped in the DB.
      channelGroups,
      // Time-series + heatmap (aggregated via SQL — never pulls raw rows).
      postSeriesRows,
      contactSeriesRows,
      convSeriesRows,
      msgSeriesRows,
      heatRows,
    ] = await Promise.all([
      this.prisma.post.count({ where: { ...where, createdAt: cur } }),
      this.prisma.contact.count({ where: { ...where, createdAt: cur } }),
      this.prisma.conversation.count({ where: { ...where, createdAt: cur } }),
      this.prisma.message.count({ where: msgWhere(cur) }),
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
      this.prisma.campaign.findMany({
        where,
        include: { _count: { select: { posts: true } } },
        orderBy: { posts: { _count: "desc" } },
        take: 5,
      }),
      this.prisma.post.groupBy({ by: ["channel"], where: { ...where, createdAt: cur }, _count: true }),
      this.dailyCount("Post", workspaceSlug, from, to),
      this.dailyCount("Contact", workspaceSlug, from, to),
      this.dailyCount("Conversation", workspaceSlug, from, to),
      this.dailyMessageCount(workspaceSlug, from, to),
      this.messageHeatmap(workspaceSlug, from, to),
    ]);

    // ── KPIs (windowed, period-over-period deltas) ──────────────────────────
    const kpis: KpiMetric[] = [
      { label: "Contactos nuevos", value: String(curContacts), ...delta(curContacts, prevContacts) },
      { label: "Publicaciones", value: String(curPosts), ...delta(curPosts, prevPosts) },
      { label: "Conversaciones", value: String(curConversations), ...delta(curConversations, prevConversations) },
      { label: "Mensajes", value: String(curMessages), ...delta(curMessages, prevMessages) },
      { label: "Campañas nuevas", value: String(campaignsNew), ...delta(campaignsNew, prevCampaigns) },
    ];

    // ── Time-series (continuous daily buckets from the SQL aggregates) ───────
    const postMap = dailyMap(postSeriesRows);
    const contactMap = dailyMap(contactSeriesRows);
    const convMap = dailyMap(convSeriesRows);
    const msgMap = dailyMap(msgSeriesRows);
    // Continuous buckets for the last `window` calendar days, ENDING today (so
    // the most recent day is always visible — the old range stopped yesterday).
    const series: AnalyticsPoint[] = Array.from({ length: window }, (_, i) => {
      const date = dayKey(new Date(to.getTime() - (window - 1 - i) * DAY_MS));
      return {
        date,
        posts: postMap.get(date) ?? 0,
        contacts: contactMap.get(date) ?? 0,
        conversations: convMap.get(date) ?? 0,
        messages: msgMap.get(date) ?? 0,
      };
    });

    // ── Channel share (within the window) ───────────────────────────────────
    const platforms = channelGroups
      .map((g) => ({ channel: g.channel as ChannelId, count: g._count }))
      .sort((a, b) => b.count - a.count)
      .map(({ channel, count }) => ({
        channel,
        count,
        pct: curPosts > 0 ? `${Math.round((count / curPosts) * 100)}%` : "0%",
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
    for (const r of heatRows) {
      const dow = Number(r.dow);
      const hour = Number(r.hour);
      if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) heatmap[dow]![hour] = Number(r.n);
    }

    // ── Top campaigns by number of posts (ordered + limited in the DB) ──────
    const topCampaigns = campaignRows.map(mapCampaign);

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

  /**
   * Daily counts for a workspace-scoped table, grouped in the DB by UTC day.
   * The table name is a fixed identifier (never user input), quoted safely.
   */
  private dailyCount(
    table: "Post" | "Contact" | "Conversation",
    workspaceSlug: string,
    from: Date,
    to: Date,
  ): Promise<{ day: string; n: number }[]> {
    const rel = Prisma.raw(`"${table}"`);
    return this.prisma.$queryRaw<{ day: string; n: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM ${rel}
      WHERE "workspaceSlug" = ${workspaceSlug} AND "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
    `);
  }

  /** Daily message counts, scoped to the workspace via the conversation join. */
  private dailyMessageCount(
    workspaceSlug: string,
    from: Date,
    to: Date,
  ): Promise<{ day: string; n: number }[]> {
    return this.prisma.$queryRaw<{ day: string; n: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', m."createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM "Message" m
      JOIN "Conversation" c ON c."id" = m."conversationId"
      WHERE c."workspaceSlug" = ${workspaceSlug} AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
      GROUP BY 1
    `);
  }

  /** Message counts bucketed by UTC weekday (0=Sun) × hour, grouped in the DB. */
  private messageHeatmap(
    workspaceSlug: string,
    from: Date,
    to: Date,
  ): Promise<{ dow: number; hour: number; n: number }[]> {
    return this.prisma.$queryRaw<{ dow: number; hour: number; n: number }[]>(Prisma.sql`
      SELECT EXTRACT(DOW FROM m."createdAt")::int AS dow,
             EXTRACT(HOUR FROM m."createdAt")::int AS hour,
             COUNT(*)::int AS n
      FROM "Message" m
      JOIN "Conversation" c ON c."id" = m."conversationId"
      WHERE c."workspaceSlug" = ${workspaceSlug} AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
      GROUP BY 1, 2
    `);
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
