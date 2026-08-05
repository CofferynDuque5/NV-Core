import * as React from "react";
import type { Design } from "@nv/domain";
import { Layout, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { formatSpec } from "@/lib/design";
import { useDesigns } from "@/hooks/use-domain-data";
import { useCreateDesign, useDeleteDesign } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { DesignEditor, LayerVisual } from "@/components/builder/design-editor";

/** Small non-interactive preview of a saved design. */
function DesignThumb({ design }: { design: Design }) {
  const spec = formatSpec(design.format);
  return (
    <svg viewBox={`0 0 ${spec.w} ${spec.h}`} className="h-full w-full" style={{ background: "#0B0D10" }} preserveAspectRatio="xMidYMid meet">
      {design.layers.map((l) => (
        <LayerVisual key={l.id} l={l} />
      ))}
    </svg>
  );
}

export default function BuilderPage() {
  const designs = useDesigns();
  const create = useCreateDesign();
  const del = useDeleteDesign();
  const confirm = useConfirm();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const editing: Design | undefined = editingId
    ? designs.data?.items.find((d) => d.id === editingId)
    : undefined;

  function createAndOpen() {
    create.mutate(
      { name: "Diseño sin título", format: "square", layers: [] },
      { onSuccess: (d) => setEditingId(d.id) },
    );
  }

  async function remove(d: Design) {
    const ok = await confirm({
      title: "Eliminar diseño",
      description: `¿Eliminar "${d.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(d.id);
    del.mutate(d.id, { onSettled: () => setDeletingId(null) });
  }

  if (editing) {
    return <DesignEditor design={editing} onExit={() => setEditingId(null)} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sin código"
        title="Campaign Builder"
        description="Diseña creatividades visuales por capas y reutilízalas en tus campañas."
        actions={
          <Button size="sm" onClick={createAndOpen} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Nuevo diseño
          </Button>
        }
      />

      <QueryBoundary
        query={designs}
        skeleton={<CardGridSkeleton count={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Layout,
          title: "Sin diseños todavía",
          description:
            "Crea tu primera creatividad: títulos, precios, botones e imágenes sobre un lienzo, listos para tus posts y campañas.",
          action: (
            <Button size="sm" onClick={createAndOpen} disabled={create.isPending}>
              <Plus className="size-4" /> Nuevo diseño
            </Button>
          ),
        }}
      >
        {(data) => (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {data.items.map((d) => (
              <Panel key={d.id} className="group overflow-hidden">
                <button
                  onClick={() => setEditingId(d.id)}
                  className="block aspect-square w-full overflow-hidden bg-panel-sunken"
                  title="Editar"
                >
                  <DesignThumb design={d} />
                </button>
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                    <p className="text-[11px] text-ink-faint">{formatSpec(d.format).label}</p>
                  </div>
                  <button
                    onClick={() => setEditingId(d.id)}
                    className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-high hover:text-ink"
                    title="Editar"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => remove(d)}
                    disabled={deletingId === d.id}
                    className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                    title="Eliminar"
                  >
                    {deletingId === d.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
