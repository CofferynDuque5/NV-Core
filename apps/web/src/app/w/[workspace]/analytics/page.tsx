import * as React from "react";
import { CHANNELS, type ChannelId } from "@nv/domain";
import {
  Activity,
  BarChart3,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn, relativeTime } from "@/lib/utils";
import {
  compareLabel,
  peakLabel,
  peakSlot,
  rangeLabel,
  scopeLabel,
  sourceLine,
  sumSeries,
  toChartSeries,
} from "@/lib/analytics";
import { useAnalytics } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { KpiSkeletonRow } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityHeatmap } from "@/components/analytics/activity-heatmap";

const tooltipStyle = {
  background: "hsl(var(--panel-high))",
  border: "1px solid hsl(var(--line-strong))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--ink))",
};

const PERIODS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

type MetricKey = "posts" | "contacts" | "conversations" | "messages";
const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "posts", label: "Publicaciones", color: "#5B8DEF" },
  { key: "contacts", label: "Contactos", color: "#3FB950" },
  { key: "conversations", label: "Conversaciones", color: "#7C7CF0" },
  { key: "messages", label: "Mensajes", color: "#E3B341" },
];

/** Map a KPI label to an icon + accent (presentation only). */
const KPI_META: Record<string, { icon: LucideIcon; accent: string }> = {
  "Contactos nuevos": { icon: Users, accent: "#3FB950" },
  Publicaciones: { icon: Send, accent: "#5B8DEF" },
  Conversaciones: { icon: MessageSquare, accent: "#7C7CF0" },
  Mensajes: { icon: Mail, accent: "#E3B341" },
  "Campañas nuevas": { icon: Megaphone, accent: "#F0883E" },
};

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex rounded-lg border border-line-soft bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-brand/15 text-ink-bright" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = React.useState<number>(30);
  const [metric, setMetric] = React.useState<MetricKey>("posts");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const analytics = useAnalytics(days);
  const snap = analytics.data;
  const sources = snap?.sources;
  // Re-render every 30 s so "Actualizado hace …" stays truthful.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const periodLabel = rangeLabel(snap?.range);
  const compared = compareLabel(snap?.range);
  /** Panel subtitle with its provenance appended, when the API sent it. */
  const withSource = (text: string, key: keyof NonNullable<typeof sources>) => {
    const src = sources?.[key];
    return src ? `${text} · ${src.source} · ${scopeLabel(src.scope)}` : text;
  };

  const series = toChartSeries(snap?.series);
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const metricTotal = sumSeries(snap?.series, metric);

  const platformData = (snap?.platforms ?? []).map((p) => ({
    name: CHANNELS[p.channel as ChannelId].name,
    value: p.count ?? (parseInt(p.pct, 10) || 0),
    pct: p.pct,
    fill: CHANNELS[p.channel as ChannelId].color,
  }));
  const stageData = (snap?.funnel ?? []).map((f) => ({
    name: f.label,
    value: Number(f.value) || 0,
    fill: f.accent,
  }));
  const heatmap = snap?.heatmap ?? [];
  const peak = peakLabel(peakSlot(heatmap));

  const hasActivity =
    (snap?.kpis ?? []).some((k) => Number(k.value) > 0) || platformData.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business Intelligence"
        title="Analytics"
        description="Métricas reales de tu workspace, comparadas con el período anterior."
        actions={
          <Segmented
            ariaLabel="Período"
            options={PERIODS.map((p) => ({ value: p.days, label: p.label }))}
            value={days}
            onChange={setDays}
          />
        }
      />

      {/* Where the numbers come from and how fresh they are */}
      {snap ? (
        <div
          data-testid="analytics-provenance"
          className="nv-panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-ink-muted"
        >
          <span>
            <span className="text-ink-faint">Fuente:</span> datos propios de este workspace (no se consultan redes
            externas)
          </span>
          {periodLabel ? (
            <span>
              <span className="text-ink-faint">Período:</span> {periodLabel}
              {compared ? <span className="text-ink-faint"> · comparado con {compared}</span> : null}
            </span>
          ) : null}
          {snap.generatedAt ? (
            <span title={new Date(snap.generatedAt).toLocaleString()}>
              <span className="text-ink-faint">Actualizado:</span> {relativeTime(snap.generatedAt)}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            disabled={analytics.isFetching}
            onClick={() => void analytics.refetch()}
          >
            <RefreshCw className={cn("size-3.5", analytics.isFetching && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      ) : null}

      {/* KPI row (period-over-period deltas) */}
      {analytics.isLoading ? (
        <KpiSkeletonRow count={5} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {(snap?.kpis ?? []).map((k) => {
            const meta = KPI_META[k.label] ?? { icon: BarChart3, accent: "#5B8DEF" };
            return (
              <KpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                delta={k.delta}
                deltaTrend={k.deltaTrend}
                icon={meta.icon}
                accent={meta.accent}
                footnote={sourceLine(k.source)}
                hint={k.source?.method}
              />
            );
          })}
        </div>
      )}

      {/* Conversion / engagement rates */}
      {!analytics.isLoading && (snap?.conversion?.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {snap!.conversion!.map((r) => (
            <div key={r.label} className="nv-panel p-4" title={r.source?.method}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">{r.label}</span>
                <span className="text-lg font-semibold tabular-nums text-ink-bright">{r.value}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.accent }} />
              </div>
              {r.source ? <div className="mt-2 text-[11px] text-ink-faint">{sourceLine(r.source)}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {analytics.isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : !hasActivity ? (
        <EmptyState
          icon={BarChart3}
          title="Aún no hay actividad en este período"
          description="Crea contactos, publica y conversa para ver tendencias, distribución por canal y tu mapa de actividad."
        />
      ) : (
        <>
          {/* Trend over time */}
          <Panel>
            <PanelHeader
              title="Tendencia"
              description={withSource(`${metricTotal} en los últimos ${days} días`, "series")}
              action={
                <Segmented
                  ariaLabel="Métrica"
                  options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
                  value={metric}
                  onChange={setMetric}
                />
              }
            />
            <div className="h-72 p-4">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: -16, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "hsl(var(--ink-faint))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={40}
                      tick={{ fill: "hsl(var(--ink-faint))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "hsl(var(--line-strong))" }} />
                    <Area
                      type="monotone"
                      dataKey={metric}
                      name={activeMetric.label}
                      stroke={activeMetric.color}
                      strokeWidth={2}
                      fill="url(#metricFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </Panel>

          {/* Channel share + stage distribution */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Publicaciones por canal" description={withSource(`Período: ${days} días`, "platforms")} />
              <div className="h-72 p-4">
                {mounted && platformData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={platformData} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={80}
                        tick={{ fill: "hsl(var(--ink-muted))", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: "hsl(var(--panel-raised))" }}
                        formatter={(v: number, _n, p) => [`${v} (${(p?.payload as { pct?: string })?.pct ?? ""})`, "Publicaciones"]}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {platformData.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center text-xs text-ink-faint">Sin publicaciones</div>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Contactos por etapa" description={withSource("Etapas actuales", "funnel")} />
              <div className="h-72 p-4">
                {mounted && stageData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stageData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        label={(e) => `${e.name} (${e.value})`}
                      >
                        {stageData.map((d) => (
                          <Cell key={d.name} fill={d.fill} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center text-xs text-ink-faint">Sin contactos</div>
                )}
              </div>
            </Panel>
          </div>

          {/* Activity heatmap */}
          <Panel>
            <PanelHeader
              title="Mapa de actividad"
              description={withSource(peak ? `Hora pico: ${peak} (UTC)` : "Mensajes por día y hora (UTC)", "heatmap")}
            />
            <ActivityHeatmap matrix={heatmap} />
          </Panel>
        </>
      )}

      {/* Top campaigns */}
      {(snap?.topCampaigns ?? []).length > 0 ? (
        <Panel>
          <PanelHeader title="Mejores campañas" description={withSource("Por número de publicaciones", "topCampaigns")} />
          <ul className="divide-y divide-line">
            {(snap?.topCampaigns ?? []).map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-6 place-items-center rounded-md bg-panel-raised text-xs font-bold text-ink-muted">
                  {i + 1}
                </span>
                <Activity className="size-4 text-state-success" />
                <span className="flex-1 truncate text-sm text-ink">{c.name}</span>
                <span className="text-xs text-ink-muted">{c.posts} posts</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
