import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CalendarView } from "@/lib/calendar";

const VIEWS: { value: CalendarView; label: string; key: string }[] = [
  { value: "month", label: "Mes", key: "M" },
  { value: "week", label: "Semana", key: "S" },
  { value: "day", label: "Día", key: "D" },
];

/**
 * Calendar toolbar — everything needed to navigate and act is one row:
 * range label, ‹ Hoy ›, view switcher (with keyboard hints) and the primary
 * "Programar" action. Keeps the 80% actions (navigate, switch, create) within
 * a single glance and a single click.
 */
export function CalendarToolbar({
  view,
  onView,
  label,
  onPrev,
  onToday,
  onNext,
  onCreate,
}: {
  view: CalendarView;
  onView: (v: CalendarView) => void;
  label: string;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-line-soft bg-panel">
          <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Anterior" title="Anterior (←)">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToday} title="Ir a hoy (T)">
            Hoy
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} aria-label="Siguiente" title="Siguiente (→)">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <h2 className="font-display text-lg font-semibold text-ink-bright">{label}</h2>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-line-soft bg-panel p-0.5" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              role="tab"
              aria-selected={view === v.value}
              onClick={() => onView(v.value)}
              title={`${v.label} (${v.key})`}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                view === v.value
                  ? "bg-panel-raised text-ink-bright shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={onCreate} title="Nueva publicación (N)">
          <Plus className="size-4" /> Programar
        </Button>
      </div>
    </div>
  );
}
