import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Image as ImageIcon, Plus, Save } from "lucide-react";
import type { Design, DesignFormat, DesignLayer } from "@nv/domain";

import { cn } from "@/lib/utils";
import {
  FORMATS,
  PALETTE,
  addLayer,
  duplicateLayer,
  formatSpec,
  lower,
  moveLayer,
  raise,
  removeLayer,
  resizeLayer,
  toBack,
  toFront,
  toSvg,
  updateLayer,
} from "@/lib/design";
import { useUpdateDesign } from "@/hooks/use-domain-mutations";
import { useMediaAssets } from "@/hooks/use-domain-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LayerInspector } from "./layer-inspector";

const BOX_W = 460;
const BOX_H = 520;

/** Non-interactive SVG rendering of a single layer (mirrors lib/design.toSvg). */
export function LayerVisual({ l }: { l: DesignLayer }) {
  if (l.type === "rect") {
    return <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={l.radius ?? 0} fill={l.fill ?? "#12151A"} />;
  }
  if (l.type === "image") {
    if (l.src) {
      return (
        <>
          <clipPath id={`clip-${l.id}`}>
            <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={l.radius ?? 0} />
          </clipPath>
          <image href={l.src} x={l.x} y={l.y} width={l.w} height={l.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${l.id})`} />
        </>
      );
    }
    return <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={l.radius ?? 0} fill={l.fill ?? "#1C2229"} />;
  }
  if (l.type === "button") {
    return (
      <>
        <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={l.radius ?? 0} fill={l.fill ?? "#5B8DEF"} />
        <text
          x={l.x + l.w / 2}
          y={l.y + l.h / 2}
          fontFamily="Inter, sans-serif"
          fontSize={l.fontSize ?? 32}
          fontWeight={l.weight ?? 700}
          fill={l.color ?? "#fff"}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {l.text}
        </text>
      </>
    );
  }
  const anchor = l.align === "center" ? "middle" : l.align === "right" ? "end" : "start";
  const tx = l.align === "center" ? l.x + l.w / 2 : l.align === "right" ? l.x + l.w : l.x;
  return (
    <text
      x={tx}
      y={l.y + (l.fontSize ?? 40)}
      fontFamily="Inter, sans-serif"
      fontSize={l.fontSize ?? 40}
      fontWeight={l.weight ?? 600}
      fill={l.color ?? "#fff"}
      textAnchor={anchor}
    >
      {l.text}
    </text>
  );
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DesignEditor({ design, onExit }: { design: Design; onExit: () => void }) {
  const [name, setName] = React.useState(design.name);
  const [format, setFormat] = React.useState<DesignFormat>(design.format);
  const [layers, setLayers] = React.useState<DesignLayer[]>(design.layers ?? []);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const update = useUpdateDesign();
  const media = useMediaAssets();
  const drag = React.useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  const spec = formatSpec(format);
  const s = Math.min(BOX_W / spec.w, BOX_H / spec.h); // display px per canvas unit
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  function mutate(next: DesignLayer[]) {
    setLayers(next);
    setDirty(true);
  }

  function onLayerDown(e: React.PointerEvent, l: DesignLayer) {
    e.stopPropagation();
    setSelectedId(l.id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: l.id, mode: "move", sx: e.clientX, sy: e.clientY, ox: l.x, oy: l.y, ow: l.w, oh: l.h };
  }
  function onHandleDown(e: React.PointerEvent, l: DesignLayer) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: l.id, mode: "resize", sx: e.clientX, sy: e.clientY, ox: l.x, oy: l.y, ow: l.w, oh: l.h };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / s;
    const dy = (e.clientY - d.sy) / s;
    if (d.mode === "move") setLayers((ls) => moveLayer(ls, d.id, d.ox + dx, d.oy + dy, format));
    else setLayers((ls) => resizeLayer(ls, d.id, d.ow + dx, d.oh + dy));
  }
  function onPointerUp() {
    if (drag.current) {
      drag.current = null;
      setDirty(true);
    }
  }

  function patchSelected(patch: Partial<DesignLayer>) {
    if (selectedId) mutate(updateLayer(layers, selectedId, patch));
  }

  function save() {
    update.mutate(
      { id: design.id, input: { name, format, layers } },
      { onSuccess: () => setDirty(false) },
    );
  }

  function exportSvg() {
    download(`${name || "diseno"}.svg`, new Blob([toSvg({ ...design, name, format, layers })], { type: "image/svg+xml" }));
  }
  function exportPng() {
    const svg = toSvg({ ...design, name, format, layers });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = spec.w;
      canvas.height = spec.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (b) download(`${name || "diseno"}.png`, b);
        else toast.error("No se pudo exportar PNG (imagen externa). Usa SVG.");
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("No se pudo exportar PNG. Usa SVG.");
    };
    img.src = url;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onExit} className="flex size-9 items-center justify-center rounded-lg border border-line-soft text-ink-muted transition-colors hover:text-ink" title="Volver" aria-label="Volver">
          <ArrowLeft className="size-4" />
        </button>
        <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="h-9 max-w-[240px] font-medium" aria-label="Nombre del diseño" />
        <select
          value={format}
          onChange={(e) => { setFormat(e.target.value as DesignFormat); setDirty(true); }}
          className="h-9 rounded-lg border border-line-soft bg-panel px-2 text-xs text-ink"
          aria-label="Formato"
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportSvg}><Download className="size-4" /> SVG</Button>
          <Button variant="secondary" size="sm" onClick={exportPng}>PNG</Button>
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending}><Save className="size-4" /> Guardar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[190px_1fr_280px]">
        {/* Palette + layers */}
        <div className="space-y-4">
          <div className="nv-panel p-3">
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Elementos</p>
            <div className="space-y-1.5">
              {PALETTE.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { mutate(addLayer(layers, p.key, format)); }}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-line-soft bg-panel-raised px-2.5 py-2 text-left transition-colors hover:border-line-bright"
                >
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-panel-high text-sm text-ink-muted">{p.glyph}</span>
                  <span className="min-w-0 text-xs font-medium text-ink">{p.label}</span>
                  <Plus className="ml-auto size-3.5 text-ink-faint" />
                </button>
              ))}
            </div>
          </div>

          <div className="nv-panel p-3">
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Capas</p>
            {layers.length === 0 ? (
              <p className="px-1 text-xs text-ink-faint">Sin capas todavía.</p>
            ) : (
              <ul className="space-y-0.5">
                {[...layers].reverse().map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setSelectedId(l.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        selectedId === l.id ? "bg-brand/12 text-ink-bright" : "text-ink-soft hover:bg-panel-raised",
                      )}
                    >
                      <span className="text-ink-faint">{l.type === "image" ? "▣" : l.type === "text" ? "T" : l.type === "button" ? "▭" : "◼"}</span>
                      <span className="min-w-0 flex-1 truncate">{l.text || l.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="nv-panel grid place-items-center overflow-auto bg-panel-sunken p-6" style={{ minHeight: BOX_H + 48 }}>
          <svg
            width={spec.w * s}
            height={spec.h * s}
            viewBox={`0 0 ${spec.w} ${spec.h}`}
            className="touch-none rounded-lg shadow-panel"
            style={{ background: "#0B0D10" }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSelectedId(null)}
          >
            {layers.map((l) => (
              <g key={l.id}>
                <LayerVisual l={l} />
                {/* transparent hit target for select + drag */}
                <rect
                  x={l.x}
                  y={l.y}
                  width={l.w}
                  height={l.h}
                  fill="transparent"
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => onLayerDown(e, l)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(l.id); }}
                />
              </g>
            ))}
            {selected ? (
              <g>
                <rect
                  x={selected.x}
                  y={selected.y}
                  width={selected.w}
                  height={selected.h}
                  fill="none"
                  stroke="#5B8DEF"
                  strokeWidth={2 / s}
                  strokeDasharray={`${6 / s} ${4 / s}`}
                  pointerEvents="none"
                />
                <rect
                  x={selected.x + selected.w - 9 / s}
                  y={selected.y + selected.h - 9 / s}
                  width={18 / s}
                  height={18 / s}
                  fill="#5B8DEF"
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => onHandleDown(e, selected)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
              </g>
            ) : null}
          </svg>
        </div>

        {/* Inspector */}
        <div className="nv-panel h-fit">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-bright">Propiedades</h2>
          </div>
          <LayerInspector
            layer={selected}
            media={media.data?.items ?? []}
            onChange={patchSelected}
            onDuplicate={() => selectedId && mutate(duplicateLayer(layers, selectedId))}
            onDelete={() => { if (selectedId) { mutate(removeLayer(layers, selectedId)); setSelectedId(null); } }}
            onRaise={() => selectedId && mutate(raise(layers, selectedId))}
            onLower={() => selectedId && mutate(lower(layers, selectedId))}
            onFront={() => selectedId && mutate(toFront(layers, selectedId))}
            onBack={() => selectedId && mutate(toBack(layers, selectedId))}
          />
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <ImageIcon className="size-3.5" /> Diseña una vez y reutiliza en tus posts y campañas. Exporta a SVG o PNG.
      </p>
    </div>
  );
}
