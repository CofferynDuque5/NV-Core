
import { LayoutTemplate, Save, Sparkles, Type } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

const OBJECT_PALETTE = [
  { type: "Texto", label: "Título / Subtítulo", glyph: "T" },
  { type: "Precio", label: "Bloque de precio", glyph: "$" },
  { type: "Imagen", label: "Imagen de fondo", glyph: "▣" },
  { type: "Botón", label: "CTA", glyph: "▭" },
  { type: "Sticker", label: "Badge / Descuento", glyph: "★" },
  { type: "Cuenta regresiva", label: "Countdown", glyph: "◷" },
] as const;

export default function BuilderPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sin código"
        title="Campaign Builder"
        description="Diseña contenido visual para tus campañas."
        actions={
          <>
            <Button variant="secondary" size="sm">
              <Save className="size-4" /> Guardar borrador
            </Button>
            <Button size="sm">Programar</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[200px_1fr_260px]">
        {/* Object palette */}
        <Panel className="h-fit">
          <PanelHeader title="Elementos" />
          <div className="space-y-1.5 p-3">
            {OBJECT_PALETTE.map((o) => (
              <button
                key={o.type}
                className="flex w-full items-center gap-2.5 rounded-lg border border-line-soft bg-panel-raised px-2.5 py-2 text-left transition-colors hover:border-line-bright"
              >
                <span className="grid size-7 place-items-center rounded-md bg-panel-high text-sm text-ink-muted">
                  {o.glyph}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink">{o.type}</span>
                  <span className="block truncate text-[10px] text-ink-faint">{o.label}</span>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Canvas */}
        <Panel className="flex min-h-[440px] items-center justify-center bg-panel-sunken p-6">
          <EmptyState
            icon={LayoutTemplate}
            title="Lienzo vacío"
            description="Arrastra elementos desde el panel izquierdo para empezar a diseñar tu creatividad."
          />
        </Panel>

        {/* Properties */}
        <Panel className="h-fit">
          <PanelHeader title="Propiedades" />
          <div className="p-4">
            <EmptyState
              icon={Type}
              title="Nada seleccionado"
              description="Selecciona un elemento del lienzo para editar su contenido y estilo."
              compact
            />
          </div>
        </Panel>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Sparkles className="size-3.5" /> Las variables dinámicas (precio, stock…) se enlazarán a tu
        base de datos cuando conectes el backend.
      </p>
    </div>
  );
}
