
import * as React from "react";
import { Filter, Plus } from "lucide-react";

import { useSegments } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { SegmentCreateDialog } from "@/components/entities/segment-create-dialog";

export default function SegmentosPage() {
  const segments = useSegments();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audiencia dinámica"
        title="Segmentos"
        description="Audiencias que se actualizan solas según reglas."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Nuevo segmento
          </Button>
        }
      />

      <QueryBoundary
        query={segments}
        skeleton={<CardGridSkeleton count={4} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Filter,
          title: "Sin segmentos",
          description:
            "Crea un segmento con reglas (servicio, estado, etiquetas, actividad…) para lanzar campañas dirigidas.",
          action: (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nuevo segmento
            </Button>
          ),
        }}
      >
        {(d) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.items.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-ink-bright">{s.name}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-ink-faint">
                    {s.count} {s.count === 1 ? "contacto" : "contactos"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.rules.length === 0 ? (
                    <span className="text-[11px] text-ink-faint">Sin reglas definidas</span>
                  ) : (
                    s.rules.map((r, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted"
                      >
                        {r.field} {r.operator} {r.value}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>

      <SegmentCreateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
