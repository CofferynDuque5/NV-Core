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

import { Link } from "react-router-dom";
import { simplifyNotice } from "@nv/domain";

import { useWorkspace } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import {
  useAnalytics,
  useCampaigns,
  useNotifications,
  useTodayPosts,
} from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { SampleDataBanner } from "@/components/dashboard/sample-data-banner";
import { GoalSteps } from "@/components/dashboard/goal-steps";
import { DayActivity } from "@/components/dashboard/day-activity";
import { Panel, PanelHeader } from "@/components/common/panel";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

const NOTIF_ACCENT: Record<string, string> = {
  info: "#5B8DEF",
  success: "#3FB950",
  warning: "#E3B341",
  error: "#F85149",
};

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
  const analytics = useAnalytics(7);
  const firstName = useAuthStore((s) => s.user?.name.split(" ")[0]);

  const activePosts = posts.data ?? [];
  const activeCampaigns = (campaigns.data?.items ?? []).filter(
    (c) => c.status === "activa" || c.status === "programada",
  );
  const alerts = (notifications.data ?? []).filter(
    (n) => n.type === "error" || n.type === "warning",
  );
  // Real weekly activity: the Analytics snapshot's "Mensajes" KPI (no fake reach).
  const weeklyMessages = analytics.data?.kpis.find((k) => k.label === "Mensajes")?.value ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ws.name}
        title={firstName ? `Hola, ${firstName} 👋` : "Hola 👋"}
        description="Lo que pasa hoy en tu marca: publicaciones, campañas y avisos."
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/w/${ws.slug}/calendario`}>Ver agenda</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/w/${ws.slug}/campanas`}>
                <Megaphone className="size-4" /> Campañas
              </Link>
            </Button>
          </>
        }
      />

      {/* Guided onboarding — hides itself once dismissed or when the DB has no signal */}
      <GoalSteps />
      <OnboardingChecklist />
      <SampleDataBanner slug={ws.slug} />

      {/* KPI tiles — every value is real; metrics show em-dash until the backend has data */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Campañas activas"
          icon={Megaphone}
          accent="#5B8DEF"
          loading={campaigns.isLoading}
          value={campaigns.data ? String(activeCampaigns.length) : null}
        />
        <KpiCard
          label="Publicaciones hoy"
          icon={Send}
          accent="#7C7CF0"
          loading={posts.isLoading}
          value={posts.data ? String(activePosts.length) : null}
        />
        <KpiCard
          label="Mensajes (7 días)"
          icon={Eye}
          accent="#3FB950"
          loading={analytics.isLoading}
          value={weeklyMessages}
        />
        <KpiCard
          label="Alertas activas"
          icon={AlertTriangle}
          accent="#F85149"
          loading={notifications.isLoading}
          value={notifications.data ? String(alerts.length) : null}
        />
      </div>

      <DayActivity />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Today's agenda */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Publicaciones de hoy"
            description="Agenda del día por canal"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/w/${ws.slug}/calendario`}>Ver agenda →</Link>
              </Button>
            }
          />
          <div className="p-4">
            {posts.isLoading ? (
              <ListSkeleton rows={4} />
            ) : activePosts.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nada programado para hoy"
                description="Programa tu primera publicación desde el Calendario o el Editor de contenido."
                action={
                  <Button size="sm" asChild>
                    <Link to={`/w/${ws.slug}/builder`}>Crear publicación</Link>
                  </Button>
                }
                compact
              />
            ) : (
              <ul className="space-y-2">
                {activePosts.map((p) => (
                  <li
                    key={p.id}
                    className="border-line-soft bg-panel-raised flex items-center gap-3 rounded-xl border p-3"
                  >
                    <span className="bg-panel-high text-ink-muted rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase">
                      {p.channel}
                    </span>
                    <span className="text-ink flex-1 truncate text-sm">{p.title}</span>
                    {p.scheduledAt ? (
                      <span className="text-ink-faint whitespace-nowrap text-xs">
                        {new Date(p.scheduledAt).toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Alerts */}
        <Panel>
          <PanelHeader title="Alertas" description="Avisos y errores que piden tu atención" />
          <div className="p-4">
            {notifications.isLoading ? (
              <ListSkeleton rows={3} />
            ) : alerts.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Todo en orden"
                description="No hay alertas activas en este workspace."
                compact
              />
            ) : (
              <ul className="space-y-2">
                {alerts.slice(0, 5).map((n) => (
                  <li
                    key={n.id}
                    className="bg-panel-raised flex items-start gap-2.5 rounded-xl p-3"
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: NOTIF_ACCENT[n.type] ?? NOTIF_ACCENT.info }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="text-ink truncate text-sm">{n.title}</div>
                      {n.meta ? (
                        <div className="text-ink-faint line-clamp-3 text-xs">
                          {simplifyNotice(n.meta)}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
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
                <Link to={`/w/${ws.slug}/campanas`}>Todas →</Link>
              </Button>
            }
          />
          <div className="p-4">
            {campaigns.isLoading ? (
              <ListSkeleton rows={3} />
            ) : activeCampaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Aún no hay campañas activas"
                description="Crea tu primera campaña para empezar a publicar de forma omnicanal."
                action={
                  <Button size="sm" asChild>
                    <Link to={`/w/${ws.slug}/campanas`}>Nueva campaña</Link>
                  </Button>
                }
                compact
              />
            ) : (
              <ul className="space-y-2">
                {activeCampaigns.slice(0, 5).map((c) => (
                  <li
                    key={c.id}
                    className="border-line-soft bg-panel-raised flex items-center gap-3 rounded-xl border p-3"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: c.accent ?? "#5B8DEF" }}
                      aria-hidden
                    />
                    <span className="text-ink flex-1 truncate text-sm">{c.name}</span>
                    <span className="bg-panel-high text-ink-muted rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
                      {c.status}
                    </span>
                    <span className="text-ink-faint w-10 text-right text-xs tabular-nums">
                      {c.progress}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Quick actions */}
        <Panel>
          <PanelHeader title="Accesos rápidos" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {QUICK_ACTIONS.map((qa) => (
              <Link
                key={qa.label}
                to={`/w/${ws.slug}/${qa.href}`}
                className="border-line-soft bg-panel-raised hover:border-line-bright flex flex-col items-start gap-2 rounded-xl border p-3 transition-colors"
              >
                <span
                  className="grid size-8 place-items-center rounded-lg"
                  style={{ background: `${qa.accent}22`, color: qa.accent }}
                >
                  <qa.icon className="size-4" />
                </span>
                <span className="text-ink text-xs font-medium">{qa.label}</span>
              </Link>
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
              <Link to={`/w/${ws.slug}/analytics`}>Ver Analytics →</Link>
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

      <p className="text-ink-faint flex items-center gap-1.5 text-xs">
        <Zap className="size-3.5" /> Los indicadores muestran «—» hasta conectar el backend. Ningún
        dato es ficticio.
      </p>
    </div>
  );
}
