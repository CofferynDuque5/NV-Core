"use client";

import { Activity, BarChart3, Filter, TrendingUp } from "lucide-react";

import { useAnalytics } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { KpiSkeletonRow } from "@/components/common/skeletons";
import { EMPTY_METRIC } from "@/lib/utils";

const KPI_LABELS = [
  "Alcance total",
  "Engagement",
  "CTR promedio",
  "Conversiones",
  "Tiempo respuesta",
  "Costo por lead",
];

export default function AnalyticsPage() {
  const analytics = useAnalytics();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business Intelligence"
        title="Analytics"
        description="Rendimiento de tus campañas y canales."
      />

      {/* KPIs */}
      {analytics.isLoading ? (
        <KpiSkeletonRow count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {KPI_LABELS.map((label) => (
            <div key={label} className="nv-panel p-4">
              <div className="text-2xl font-semibold text-ink-bright">{EMPTY_METRIC}</div>
              <div className="mt-1 text-xs text-ink-muted">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Embudo de conversión" />
          <div className="p-4">
            <EmptyState
              icon={Filter}
              title="Sin datos de embudo"
              description="Impresiones → Alcance → Clics → Conversiones aparecerán aquí."
              compact
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Alcance por plataforma" />
          <div className="p-4">
            <EmptyState
              icon={BarChart3}
              title="Sin distribución"
              description="La participación por canal se calculará con tu actividad real."
              compact
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Mapa de calor · mejores horarios" />
          <div className="p-4">
            <EmptyState
              icon={Activity}
              title="Sin actividad"
              description="El engagement por día y hora se poblará con datos históricos."
              compact
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Mejores campañas" />
          <div className="p-4">
            <EmptyState
              icon={TrendingUp}
              title="Sin ranking"
              description="Tus campañas de mejor rendimiento se listarán aquí."
              compact
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
