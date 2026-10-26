import * as React from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Download,
  FileText,
  Inbox,
  ListChecks,
  Megaphone,
  MessageCircle,
  MessageSquareReply,
  Send,
  UserPlus,
  Workflow,
} from "lucide-react";

import { useWeeklyReport, useWeeklyReports } from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { KpiCard } from "@/components/common/kpi-card";
import { KpiSkeletonRow } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { leadSourceLabel } from "@/lib/attribution";
import { downloadCsv, printReport } from "@/lib/download";
import { relativeTime } from "@/lib/utils";
import {
  SECTION_LABEL,
  metricDelta,
  sectionPath,
  weekRangeLabel,
  weeklyReportCsv,
  weeklyReportFileName,
} from "@/lib/weekly-report";

const METRIC_ICON: Record<string, { icon: LucideIcon; accent: string }> = {
  contacts: { icon: UserPlus, accent: "#5F86F2" },
  conversations: { icon: MessageCircle, accent: "#8C7BEF" },
  messagesIn: { icon: Inbox, accent: "#3FB950" },
  messagesOut: { icon: MessageSquareReply, accent: "#3FB950" },
  postsSent: { icon: CalendarCheck, accent: "#E3B341" },
  campaignSends: { icon: Megaphone, accent: "#F778BA" },
  automationRuns: { icon: Workflow, accent: "#8C7BEF" },
  tasksDone: { icon: ListChecks, accent: "#5F86F2" },
};

const selectClass = "h-9 rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink";

export default function InformesPage() {
  const ws = useWorkspace();
  const history = useWeeklyReports();
  const [week, setWeek] = React.useState<string | null>(null);
  // Default to the latest closed week; with none yet, the current week so far.
  React.useEffect(() => {
    if (week === null && history.isSuccess) setWeek(history.data[0]?.weekStart ?? "actual");
  }, [week, history.isSuccess, history.data]);

  const report = useWeeklyReport(week);
  const r = report.data;
  const live = r?.id === "actual";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analítica"
        title="Informe semanal"
        description="Qué pasó cada semana (lunes a domingo, hora UTC) y qué necesita atención. Se genera solo cada lunes y te avisa en notificaciones."
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <label htmlFor="report-week" className="sr-only">
              Semana
            </label>
            <select
              id="report-week"
              className={selectClass}
              value={week ?? ""}
              onChange={(e) => setWeek(e.target.value)}
              disabled={!history.isSuccess}
            >
              <option value="actual">Esta semana (en curso)</option>
              {(history.data ?? []).map((h) => (
                <option key={h.weekStart} value={h.weekStart}>
                  {weekRangeLabel(h.weekStart, h.weekEnd)}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              disabled={!r}
              onClick={() => r && downloadCsv(weeklyReportCsv(r), weeklyReportFileName(ws.slug, r))}
            >
              <Download className="size-4" /> CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!r}
              title="Abre el diálogo de impresión; elige «Guardar como PDF»"
              onClick={printReport}
            >
              <FileText className="size-4" /> PDF
            </Button>
          </div>
        }
      />

      {r ? (
        <div
          data-testid="report-provenance"
          className="nv-panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-ink-muted"
        >
          <span className="text-sm font-medium text-ink-bright">Semana del {weekRangeLabel(r.weekStart, r.weekEnd)}</span>
          {live ? (
            <span>En curso: cifras hasta ahora, comparadas con el mismo tramo de la semana pasada.</span>
          ) : (
            <span>Semana cerrada, comparada con la anterior.</span>
          )}
          <span title={new Date(r.generatedAt).toLocaleString()}>
            <span className="text-ink-faint">{live ? "Actualizado:" : "Generado:"}</span> {relativeTime(r.generatedAt)}
          </span>
          <span className="text-ink-faint">Fuente: datos propios de este workspace.</span>
        </div>
      ) : null}

      {!r ? (
        report.isError ? (
          <Panel className="p-6 text-sm text-ink-muted">No se pudo cargar el informe. Vuelve a intentarlo en un momento.</Panel>
        ) : (
          <KpiSkeletonRow />
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4" data-testid="report-metrics">
            {r.metrics.map((m) => {
              const look = METRIC_ICON[m.key] ?? { icon: Send, accent: "#5F86F2" };
              const d = metricDelta(m);
              return (
                <KpiCard
                  key={m.key}
                  label={m.label}
                  value={String(m.value)}
                  delta={d.text}
                  deltaTrend={d.trend}
                  icon={look.icon}
                  accent={look.accent}
                  footnote={`Semana anterior: ${m.previous}`}
                  hint={m.source}
                />
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3 print:block print:space-y-4">
            <Panel className="lg:col-span-2 print:![break-inside:auto]" data-testid="report-attention">
              <PanelHeader
                title="Necesita atención"
                description={
                  live
                    ? "Pendiente ahora mismo y fallos de esta semana."
                    : "Lo que estaba pendiente al cerrar la semana y los fallos de esos días."
                }
              />
              {r.attention.length === 0 ? (
                <div className="flex items-center gap-2 px-5 pb-5 pt-3 text-sm text-ink-muted">
                  <CheckCircle2 className="size-4 text-state-success" /> Nada pendiente. Todo en orden.
                </div>
              ) : (
                <ul className="divide-y divide-line-soft px-5 pb-3 pt-1">
                  {r.attention.map((a) => (
                    <li key={a.key} className="py-3 [break-inside:avoid]">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-state-warning" />
                        <span className="text-sm font-medium text-ink-bright">{a.label}</span>
                        <span className="rounded-full bg-state-warning/15 px-2 py-0.5 text-[11px] font-medium text-state-warning">
                          {a.count}
                        </span>
                        <Link
                          to={sectionPath(ws.slug, a.section)}
                          className="ml-auto text-xs text-brand hover:underline print:hidden"
                        >
                          Ir a {SECTION_LABEL[a.section] ?? a.section}
                        </Link>
                      </div>
                      <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-ink-muted">
                        {a.items.map((item) => (
                          <li key={item.id} className="truncate">
                            <span className="text-ink">{item.label}</span>
                            {item.meta ? <span> · {item.meta}</span> : null}
                          </li>
                        ))}
                        {a.count > a.items.length ? <li>y {a.count - a.items.length} más</li> : null}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel data-testid="report-lead-sources">
              <PanelHeader title="Leads por origen" description="Contactos nuevos, por su origen." />
              {r.leadSources.length === 0 ? (
                <p className="px-5 pb-5 pt-3 text-sm text-ink-muted">Sin contactos nuevos esta semana.</p>
              ) : (
                <ul className="space-y-1.5 px-5 pb-5 pt-3 text-sm">
                  {r.leadSources.map((l) => (
                    <li key={l.source ?? "none"} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink">{leadSourceLabel(l.source)}</span>
                      <span className="font-medium tabular-nums text-ink-bright">{l.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
