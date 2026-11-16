
import * as React from "react";
import { Download, Filter, Pencil, Plus, Tags, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { Segment } from "@nv/domain";

import { useContactFields, useSegments } from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDeleteSegment, useExportSegment } from "@/hooks/use-domain-mutations";
import { SegmentTagDialog } from "@/components/segments/segment-tag-dialog";
import { ruleLabel } from "@/lib/segments";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { SegmentFormDialog } from "@/components/entities/segment-form-dialog";

export default function SegmentosPage() {
  const segments = useSegments();
  const ws = useWorkspace();
  const del = useDeleteSegment();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Segment | undefined>(undefined);
  const [tagging, setTagging] = React.useState<Segment | null>(null);
  const exportSeg = useExportSegment();
  const fields = useContactFields().data ?? [];
  const labels = Object.fromEntries(fields.map((f) => [f.key, f.label]));

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }
  function openEdit(s: Segment) {
    setEditing(s);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audiencia dinámica"
        title="Segmentos"
        description="Audiencias que se actualizan solas según reglas."
        actions={
          <Button size="sm" onClick={openCreate}>
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
            "Crea un segmento con reglas (etapa, etiquetas, actividad…) para lanzar campañas dirigidas.",
          action: (
            <Button size="sm" onClick={openCreate}>
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
                className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
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
                    <>
                      {s.rules.map((r, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted"
                        >
                          {ruleLabel(r, labels)}
                        </span>
                      ))}
                      {s.rules.length > 1 ? (
                        <span className="rounded-md px-1 py-0.5 text-[11px] text-ink-faint">
                          {s.match === "any" ? "(cualquiera)" : "(todas)"}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1" data-testid="segment-actions">
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/w/${ws.slug}/contactos?segmento=${s.id}`}>
                      <Users className="size-3.5" /> Ver contactos
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={exportSeg.isPending || s.count === 0}
                    onClick={() => exportSeg.mutate({ id: s.id, name: s.name })}
                  >
                    <Download className="size-3.5" /> Exportar
                  </Button>
                  <Button variant="ghost" size="sm" disabled={s.count === 0} onClick={() => setTagging(s)}>
                    <Tags className="size-3.5" /> Etiquetar
                  </Button>
                </div>

                <div className="mt-auto flex items-center justify-end gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button aria-label="Eliminar"
                    variant="ghost"
                    size="sm"
                    disabled={del.isPending}
                    onClick={() => {
                      if (confirm(`¿Eliminar el segmento "${s.name}"?`)) del.mutate(s.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>

      <SegmentFormDialog open={open} onOpenChange={setOpen} segment={editing} />
      <SegmentTagDialog segment={tagging} onClose={() => setTagging(null)} />
    </div>
  );
}
