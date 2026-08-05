
import * as React from "react";
import { CHANNELS, CHANNEL_LIST } from "@nv/domain";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePosts } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { PostScheduleDialog } from "@/components/entities/post-schedule-dialog";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarioPage() {
  const posts = usePosts();
  const [cursor, setCursor] = React.useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [prefillDate, setPrefillDate] = React.useState<string | undefined>(undefined);

  const items = posts.data?.items ?? [];

  // Group scheduled posts by YYYY-MM-DD.
  const byDay = React.useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const p of items) {
      if (!p.scheduledAt) continue;
      const key = ymd(new Date(p.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  // Build the month grid (weeks starting Monday).
  const cells = React.useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Mon=0
    const start = new Date(cursor.year, cursor.month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const today = ymd(new Date());

  function openFor(date?: string) {
    setPrefillDate(date);
    setDialogOpen(true);
  }
  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planificación"
        title="Calendario inteligente"
        description="Programa y visualiza tu contenido en todos los canales."
        actions={
          <Button size="sm" onClick={() => openFor(undefined)}>
            <Plus className="size-4" /> Programar
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
        <Panel>
          <PanelHeader
            title={`${MONTHS[cursor.month]} ${cursor.year}`}
            action={
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })
                  }
                >
                  Hoy
                </Button>
                <Button variant="ghost" size="icon" onClick={() => shift(1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            }
          />
          <div className="p-3">
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-1 py-1 text-center text-[10px] font-medium text-ink-faint">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === cursor.month;
                const dayPosts = byDay.get(key) ?? [];
                return (
                  <button
                    key={key}
                    onClick={() => openFor(key)}
                    className={cn(
                      "flex min-h-[76px] flex-col rounded-lg border border-line-soft p-1.5 text-left transition-colors hover:border-line-bright",
                      inMonth ? "bg-panel-raised/40" : "bg-transparent opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "mb-1 grid size-5 place-items-center rounded text-[11px]",
                        key === today ? "bg-brand font-bold text-white" : "text-ink-muted",
                      )}
                    >
                      {d.getDate()}
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                      {dayPosts.slice(0, 3).map((p) => (
                        <span
                          key={p.id}
                          className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]"
                          style={{ background: CHANNELS[p.channel].softColor }}
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: CHANNELS[p.channel].color }}
                          />
                          <span className="truncate text-ink">{p.title}</span>
                        </span>
                      ))}
                      {dayPosts.length > 3 ? (
                        <span className="text-[10px] text-ink-faint">+{dayPosts.length - 3} más</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Recomendaciones IA" />
            <div className="p-4">
              <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-panel-raised p-3 text-xs text-ink-muted">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-violet" />
                Conecta un proveedor de IA para recibir sugerencias de mejores horarios y detección
                de conflictos.
              </div>
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

      <PostScheduleDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultDate={prefillDate} />
    </div>
  );
}
