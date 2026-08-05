
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CalendarClock,
  Eye,
  Megaphone,
  Send,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

import { useWorkspace } from "@/hooks/use-workspace";
import { useCampaigns, useNotifications, useTodayPosts } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

const QUICK_ACTIONS = [
  { label: "Nuevo post", icon: Send, accent: "#5B8DEF", href: "builder" },
  { label: "Generar IA", icon: Sparkles, accent: "#7C7CF0", href: "ai" },
  { label: "Programar", icon: Calendar, accent: "#3FB950", href: "calendario" },
  { label: "Automatizar", icon: Workflow, accent: "#E3B341", href: "automatizaciones" },
] as const;

export default function DashboardPage() {
  const ws = useWorkspace();
  const posts = useTodayPosts();
  const campaigns = useCampaigns();
  const notifications = useNotifications();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ws.name}
        title="Hola 👋"
        description="Este es el resumen operativo de tu workspace."
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <a href={`/w/${ws.slug}/calendario`}>Ver agenda</a>
            </Button>
            <Button size="sm" asChild>
              <a href={`/w/${ws.slug}/campanas`}>
                <Megaphone className="size-4" /> Campañas
              </a>
            </Button>
          </>
        }
      />

      {/* KPI tiles — no fabricated numbers; metrics show em-dash until backend exists */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Campañas activas" icon={Megaphone} accent="#5B8DEF" loading={campaigns.isLoading} value={campaigns.data ? String(campaigns.data.total) : null} />
        <KpiCard label="Publicaciones hoy" icon={Send} accent="#7C7CF0" loading={posts.isLoading} value={posts.data ? String(posts.data.length) : null} />
        <KpiCard label="Alcance semanal" icon={Eye} accent="#3FB950" loading={false} value={null} />
        <KpiCard label="Errores activos" icon={AlertTriangle} accent="#F85149" loading={false} value={null} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Today's agenda */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Publicaciones de hoy"
            description="Agenda del día por canal"
            action={
              <Button variant="ghost" size="sm" asChild>
                <a href={`/w/${ws.slug}/calendario`}>Ver agenda →</a>
              </Button>
            }
          />
          <div className="p-4">
            {posts.isLoading ? (
              <ListSkeleton rows={4} />
            ) : (posts.data ?? []).length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nada programado para hoy"
                description="Programa tu primera publicación desde el Calendario o el Campaign Builder."
                action={
                  <Button size="sm" asChild>
                    <a href={`/w/${ws.slug}/builder`}>Crear publicación</a>
                  </Button>
                }
                compact
              />
            ) : null}
          </div>
        </Panel>

        {/* Alerts */}
        <Panel>
          <PanelHeader title="Alertas" description="Estado del sistema" />
          <div className="p-4">
            {notifications.isLoading ? (
              <ListSkeleton rows={3} />
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Todo en orden"
                description="No hay alertas activas en este workspace."
                compact
              />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Active campaigns */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Campañas activas"
            action={
              <Button variant="ghost" size="sm" asChild>
                <a href={`/w/${ws.slug}/campanas`}>Todas →</a>
              </Button>
            }
          />
          <div className="p-4">
            {campaigns.isLoading ? (
              <ListSkeleton rows={3} />
            ) : (campaigns.data?.items ?? []).length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Aún no hay campañas"
                description="Crea tu primera campaña para empezar a publicar de forma omnicanal."
                action={
                  <Button size="sm" asChild>
                    <a href={`/w/${ws.slug}/campanas`}>Nueva campaña</a>
                  </Button>
                }
                compact
              />
            ) : null}
          </div>
        </Panel>

        {/* Quick actions */}
        <Panel>
          <PanelHeader title="Accesos rápidos" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {QUICK_ACTIONS.map((qa) => (
              <a
                key={qa.label}
                href={`/w/${ws.slug}/${qa.href}`}
                className="flex flex-col items-start gap-2 rounded-xl border border-line-soft bg-panel-raised p-3 transition-colors hover:border-line-bright"
              >
                <span
                  className="grid size-8 place-items-center rounded-lg"
                  style={{ background: `${qa.accent}22`, color: qa.accent }}
                >
                  <qa.icon className="size-4" />
                </span>
                <span className="text-xs font-medium text-ink">{qa.label}</span>
              </a>
            ))}
          </div>
        </Panel>
      </div>

      {/* Analytics teaser */}
      <Panel>
        <PanelHeader
          title="Business Intelligence"
          description="Analytics de rendimiento"
          action={
            <Button variant="ghost" size="sm" asChild>
              <a href={`/w/${ws.slug}/analytics`}>Ver Analytics →</a>
            </Button>
          }
        />
        <div className="p-4">
          <EmptyState
            icon={BarChart3}
            title="Sin datos de rendimiento todavía"
            description="Las métricas se calcularán a partir de tus campañas y conexiones activas."
            compact
          />
        </div>
      </Panel>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Zap className="size-3.5" /> Los indicadores muestran «—» hasta conectar el backend. Ningún
        dato es ficticio.
      </p>
    </div>
  );
}
