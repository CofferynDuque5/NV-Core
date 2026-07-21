"use client";

import * as React from "react";
import { CalendarDays, Plus, Sparkles } from "lucide-react";
import { CALENDAR_VIEWS, CHANNEL_LIST, type CalendarView } from "@nv/domain";

import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

const VIEW_LABELS: Record<CalendarView, string> = {
  mes: "Mes",
  semana: "Semana",
  dia: "Día",
  agenda: "Agenda",
  kanban: "Kanban",
};

export default function CalendarioPage() {
  const [view, setView] = React.useState<CalendarView>("mes");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planificación"
        title="Calendario inteligente"
        description="Programa y visualiza tu contenido en todos los canales."
        actions={
          <Button size="sm">
            <Plus className="size-4" /> Programar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-panel-raised p-1">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                view === v ? "bg-panel-high text-ink-bright" : "text-ink-muted hover:text-ink",
              )}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
        <Panel>
          <PanelHeader title={VIEW_LABELS[view]} description="Sin publicaciones programadas" />
          <div className="p-4">
            <EmptyState
              icon={CalendarDays}
              title="No hay nada programado"
              description="Cuando programes publicaciones aparecerán aquí, organizadas por canal y fecha."
              action={
                <Button size="sm">
                  <Plus className="size-4" /> Programar publicación
                </Button>
              }
            />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Recomendaciones IA" />
            <div className="p-4">
              <EmptyState
                icon={Sparkles}
                title="Sin recomendaciones"
                description="La IA sugerirá mejores horarios y detectará conflictos cuando tengas actividad."
                compact
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Leyenda por canal" />
            <ul className="space-y-2 p-4">
              {CHANNEL_LIST.map((ch) => (
                <li key={ch.id} className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="size-2.5 rounded-full" style={{ background: ch.color }} />
                  {ch.name}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
