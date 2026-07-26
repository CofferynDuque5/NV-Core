"use client";

import * as React from "react";
import { CHANNELS, type ChannelId } from "@nv/domain";
import { BarChart3, TrendingUp } from "lucide-react";
import {
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

import { useAnalytics } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { KpiSkeletonRow } from "@/components/common/skeletons";

const tooltipStyle = {
  background: "hsl(var(--panel-high))",
  border: "1px solid hsl(var(--line-strong))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--ink))",
};

export default function AnalyticsPage() {
  const analytics = useAnalytics();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const snap = analytics.data;

  const platformData = (snap?.platforms ?? []).map((p) => ({
    name: CHANNELS[p.channel as ChannelId].name,
    value: parseInt(p.pct, 10) || 0,
    fill: CHANNELS[p.channel as ChannelId].color,
  }));
  const stageData = (snap?.funnel ?? []).map((f) => ({
    name: f.label,
    value: Number(f.value) || 0,
    fill: f.accent,
  }));
  const hasCharts = platformData.length > 0 || stageData.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business Intelligence"
        title="Analytics"
        description="Métricas reales de tu workspace."
      />

      {analytics.isLoading ? (
        <KpiSkeletonRow count={7} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {(snap?.kpis ?? []).map((k) => (
            <div key={k.label} className="nv-panel p-4">
              <div className="text-2xl font-semibold text-ink-bright">{k.value}</div>
              <div className="mt-1 text-xs text-ink-muted">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {!analytics.isLoading && !hasCharts ? (
        <EmptyState
          icon={BarChart3}
          title="Aún no hay suficientes datos"
          description="Crea contactos y publicaciones para ver gráficas de distribución por canal y etapa."
        />
      ) : null}

      {hasCharts ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Publicaciones por canal" description="% del total" />
            <div className="h-72 p-4">
              {mounted && platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platformData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tick={{ fill: "hsl(var(--ink-muted))", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--panel-raised))" }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {platformData.map((d) => (
                        <Cell key={d.name} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-xs text-ink-faint">
                  Sin publicaciones
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Contactos por etapa" description="Pipeline del CRM" />
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
                <div className="grid h-full place-items-center text-xs text-ink-faint">
                  Sin contactos
                </div>
              )}
            </div>
          </Panel>
        </div>
      ) : null}

      {(snap?.topCampaigns ?? []).length > 0 ? (
        <Panel>
          <PanelHeader title="Mejores campañas" description="Por número de publicaciones" />
          <ul className="divide-y divide-line">
            {(snap?.topCampaigns ?? []).map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-6 place-items-center rounded-md bg-panel-raised text-xs font-bold text-ink-muted">
                  {i + 1}
                </span>
                <TrendingUp className="size-4 text-state-success" />
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
