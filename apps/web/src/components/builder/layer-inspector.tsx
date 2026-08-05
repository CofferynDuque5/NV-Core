import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  MoveDown,
  MoveUp,
  Trash2,
} from "lucide-react";
import type { DesignLayer, MediaAsset } from "@nv/domain";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/empty-state";
import { MousePointer2 } from "lucide-react";

const WEIGHTS = [
  { value: 400, label: "Normal" },
  { value: 600, label: "Medium" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Black" },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-line-soft bg-transparent"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

export function LayerInspector({
  layer,
  media,
  onChange,
  onDuplicate,
  onDelete,
  onRaise,
  onLower,
  onFront,
  onBack,
}: {
  layer: DesignLayer | null;
  media: MediaAsset[];
  onChange: (patch: Partial<DesignLayer>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRaise: () => void;
  onLower: () => void;
  onFront: () => void;
  onBack: () => void;
}) {
  if (!layer) {
    return (
      <div className="p-4">
        <EmptyState
          icon={MousePointer2}
          title="Nada seleccionado"
          description="Selecciona una capa en el lienzo para editar su contenido y estilo."
          compact
        />
      </div>
    );
  }

  const isText = layer.type === "text" || layer.type === "button";
  const hasFill = layer.type === "rect" || layer.type === "button" || layer.type === "image";

  return (
    <div className="space-y-4 p-4">
      {isText ? (
        <div className="space-y-1.5">
          <Label htmlFor="ly-text">Texto</Label>
          <Textarea id="ly-text" value={layer.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} rows={2} />
        </div>
      ) : null}

      {layer.type === "image" ? (
        <div className="space-y-1.5">
          <Label htmlFor="ly-src">URL de imagen</Label>
          <Input id="ly-src" value={layer.src ?? ""} placeholder="https://…" onChange={(e) => onChange({ src: e.target.value })} />
          {media.length > 0 ? (
            <select
              aria-label="Elegir de la biblioteca"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onChange({ src: e.target.value });
                e.target.value = "";
              }}
              className="mt-1 h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-2 text-xs text-ink-muted"
            >
              <option value="">Elegir de la Biblioteca…</option>
              {media.filter((m) => m.url).map((m) => (
                <option key={m.id} value={m.url}>
                  {m.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {isText ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ly-size">Tamaño</Label>
              <Input
                id="ly-size"
                type="number"
                value={layer.fontSize ?? 40}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ly-weight">Grosor</Label>
              <select
                id="ly-weight"
                value={layer.weight ?? 600}
                onChange={(e) => onChange({ weight: Number(e.target.value) })}
                className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink"
              >
                {WEIGHTS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ColorField label="Color del texto" value={layer.color ?? "#FFFFFF"} onChange={(v) => onChange({ color: v })} />

          <div className="space-y-1.5">
            <Label>Alineación</Label>
            <div className="flex gap-1">
              {([
                { v: "left", Icon: AlignLeft },
                { v: "center", Icon: AlignCenter },
                { v: "right", Icon: AlignRight },
              ] as const).map(({ v, Icon }) => (
                <button
                  key={v}
                  onClick={() => onChange({ align: v })}
                  className={cn(
                    "grid flex-1 place-items-center rounded-md border py-1.5 transition-colors",
                    (layer.align ?? "left") === v
                      ? "border-brand/60 bg-brand/10 text-ink"
                      : "border-line-soft text-ink-muted hover:text-ink",
                  )}
                  aria-label={`Alinear ${v}`}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {hasFill ? (
        <ColorField label="Relleno" value={layer.fill ?? "#12151A"} onChange={(v) => onChange({ fill: v })} />
      ) : null}

      {layer.type === "rect" || layer.type === "button" || layer.type === "image" ? (
        <div className="space-y-1.5">
          <Label htmlFor="ly-radius">Redondeo</Label>
          <Input
            id="ly-radius"
            type="number"
            value={layer.radius ?? 0}
            onChange={(e) => onChange({ radius: Number(e.target.value) })}
          />
        </div>
      ) : null}

      {/* Order + actions */}
      <div className="space-y-1.5">
        <Label>Orden</Label>
        <div className="grid grid-cols-4 gap-1">
          <button onClick={onFront} title="Traer al frente" className="grid place-items-center rounded-md border border-line-soft py-1.5 text-ink-muted hover:text-ink">
            <ChevronsUp className="size-4" />
          </button>
          <button onClick={onRaise} title="Subir" className="grid place-items-center rounded-md border border-line-soft py-1.5 text-ink-muted hover:text-ink">
            <MoveUp className="size-4" />
          </button>
          <button onClick={onLower} title="Bajar" className="grid place-items-center rounded-md border border-line-soft py-1.5 text-ink-muted hover:text-ink">
            <MoveDown className="size-4" />
          </button>
          <button onClick={onBack} title="Enviar al fondo" className="grid place-items-center rounded-md border border-line-soft py-1.5 text-ink-muted hover:text-ink">
            <ChevronsDown className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onDuplicate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-soft px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <Copy className="size-3.5" /> Duplicar
        </button>
        <button
          onClick={onDelete}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-state-danger/30 px-3 py-2 text-xs font-medium text-state-danger transition-colors hover:bg-state-danger/10"
        >
          <Trash2 className="size-3.5" /> Eliminar
        </button>
      </div>
    </div>
  );
}
