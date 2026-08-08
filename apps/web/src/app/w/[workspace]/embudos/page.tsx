
import * as React from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Filter, Pencil, Plus, Trash2 } from "lucide-react";
import type { Funnel } from "@nv/domain";

import { useFunnels } from "@/hooks/use-domain-data";
import { useDeleteFunnel } from "@/hooks/use-domain-mutations";
import { STEP_TYPE_LABEL, funnelConversion, funnelEntries, publicFunnelUrl } from "@/lib/funnels";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { FunnelFormDialog } from "@/components/entities/funnel-form-dialog";

export default function EmbudosPage() {
  const funnels = useFunnels();
  const del = useDeleteFunnel();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Funnel | undefined>(undefined);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversión"
        title="Embudos"
        description="Encadena páginas opt-in → venta → gracias y mide la conversión."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Nuevo embudo
          </Button>
        }
      />

      <QueryBoundary
        query={funnels}
        skeleton={<CardGridSkeleton count={3} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Filter,
          title: "Sin embudos",
          description:
            "Crea un embudo multipaso que capture leads y los lleve hasta la conversión.",
          action: (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nuevo embudo
            </Button>
          ),
        }}
      >
        {(d) => (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.items.map((f) => {
              const url = publicFunnelUrl(origin, f.id);
              return (
                <div
                  key={f.id}
                  className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-bright">{f.name}</span>
                    <span className="whitespace-nowrap rounded-md bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted">
                      {funnelConversion(f.steps)}% conv.
                    </span>
                  </div>

                  {/* Step flow */}
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {f.steps.map((s, i) => (
                      <React.Fragment key={s.id}>
                        {i > 0 ? <span className="text-ink-faint">→</span> : null}
                        <span className="rounded-md bg-panel-raised px-1.5 py-0.5 text-ink-muted">
                          {STEP_TYPE_LABEL[s.type]} · {s.views}
                        </span>
                      </React.Fragment>
                    ))}
                    {f.steps.length === 0 ? (
                      <span className="text-ink-faint">Sin pasos</span>
                    ) : null}
                  </div>

                  <div className="text-[11px] text-ink-faint">
                    {funnelEntries(f.steps)} entradas · {f.steps.length} paso(s)
                  </div>

                  <div className="mt-auto flex items-center gap-1 pt-1">
                    <Button variant="secondary" size="sm" onClick={() => copyUrl(url)}>
                      <Copy className="size-3.5" /> Enlace
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={url} target="_blank" rel="noreferrer" aria-label="Abrir embudo">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                    <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(f);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={del.isPending}
                        onClick={() => {
                          if (confirm(`¿Eliminar el embudo "${f.name}"?`)) del.mutate(f.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </QueryBoundary>

      <FunnelFormDialog open={open} onOpenChange={setOpen} funnel={editing} />
    </div>
  );
}
