import type { Design, DesignFormat, DesignLayer } from "@nv/domain";

/**
 * Pure Campaign-Builder logic — no React, unit-tested. Layer geometry is in
 * canvas units (the format's pixel space); the editor scales for display and
 * `toSvg` serializes the same units for export.
 */

export interface FormatSpec {
  id: DesignFormat;
  label: string;
  w: number;
  h: number;
}

export const FORMATS: FormatSpec[] = [
  { id: "square", label: "Cuadrado 1:1", w: 1080, h: 1080 },
  { id: "portrait", label: "Retrato 4:5", w: 1080, h: 1350 },
  { id: "story", label: "Historia 9:16", w: 1080, h: 1920 },
  { id: "landscape", label: "Horizontal 16:9", w: 1920, h: 1080 },
];

export function formatSpec(f: DesignFormat): FormatSpec {
  return FORMATS.find((x) => x.id === f) ?? FORMATS[0]!;
}

const MIN = 24;

// ── Palette presets ──────────────────────────────────────────────────────────
export interface PaletteItem {
  key: string;
  label: string;
  glyph: string;
  build: () => Omit<DesignLayer, "id" | "x" | "y">;
}

export const PALETTE: PaletteItem[] = [
  {
    key: "title",
    label: "Título",
    glyph: "T",
    build: () => ({ type: "text", w: 760, h: 120, text: "Tu titular aquí", fontSize: 84, weight: 800, color: "#F3F5F8", align: "left" }),
  },
  {
    key: "subtitle",
    label: "Subtítulo",
    glyph: "t",
    build: () => ({ type: "text", w: 700, h: 70, text: "Subtítulo o descripción", fontSize: 40, weight: 500, color: "#9BA3AE", align: "left" }),
  },
  {
    key: "price",
    label: "Precio",
    glyph: "$",
    build: () => ({ type: "text", w: 320, h: 110, text: "$499", fontSize: 96, weight: 800, color: "#3FB950", align: "left" }),
  },
  {
    key: "button",
    label: "Botón (CTA)",
    glyph: "▭",
    build: () => ({ type: "button", w: 340, h: 96, text: "Comprar ahora", fontSize: 34, weight: 700, color: "#FFFFFF", fill: "#5B8DEF", radius: 48, align: "center" }),
  },
  {
    key: "badge",
    label: "Etiqueta / Descuento",
    glyph: "★",
    build: () => ({ type: "button", w: 200, h: 200, text: "-50%", fontSize: 52, weight: 800, color: "#0B0D10", fill: "#E3B341", radius: 100, align: "center" }),
  },
  {
    key: "image",
    label: "Imagen",
    glyph: "▣",
    build: () => ({ type: "image", w: 520, h: 520, fill: "#1C2229", radius: 16, src: "" }),
  },
  {
    key: "bg",
    label: "Fondo",
    glyph: "◼",
    build: () => ({ type: "rect", w: 0, h: 0, fill: "#12151A", radius: 0 }),
  },
];

// ── ID generation ────────────────────────────────────────────────────────────
export function nextId(prefix: string, existing: { id: string }[]): string {
  let max = 0;
  for (const item of existing) {
    const m = item.id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

// ── Layer CRUD (immutable) ───────────────────────────────────────────────────
export function addLayer(layers: DesignLayer[], key: string, format: DesignFormat): DesignLayer[] {
  const preset = PALETTE.find((p) => p.key === key);
  if (!preset) return layers;
  const spec = formatSpec(format);
  const base = preset.build();
  // "bg" fills the whole canvas; others are centered with a small cascade.
  const isBg = key === "bg";
  const w = isBg ? spec.w : base.w;
  const h = isBg ? spec.h : base.h;
  const cascade = layers.length * 16;
  const x = isBg ? 0 : Math.round((spec.w - w) / 2) + cascade;
  const y = isBg ? 0 : Math.round((spec.h - h) / 2) + cascade;
  const layer: DesignLayer = { ...base, w, h, id: nextId("l", layers), x, y };
  // Backgrounds go to the bottom of the stack; everything else on top.
  return isBg ? [layer, ...layers] : [...layers, layer];
}

export function updateLayer(layers: DesignLayer[], id: string, patch: Partial<DesignLayer>): DesignLayer[] {
  return layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
}

export function removeLayer(layers: DesignLayer[], id: string): DesignLayer[] {
  return layers.filter((l) => l.id !== id);
}

export function duplicateLayer(layers: DesignLayer[], id: string): DesignLayer[] {
  const src = layers.find((l) => l.id === id);
  if (!src) return layers;
  const copy: DesignLayer = { ...src, id: nextId("l", layers), x: src.x + 24, y: src.y + 24 };
  return [...layers, copy];
}

/** Move a layer, clamping so at least part stays on the canvas. */
export function moveLayer(layers: DesignLayer[], id: string, x: number, y: number, format: DesignFormat): DesignLayer[] {
  const spec = formatSpec(format);
  return layers.map((l) => {
    if (l.id !== id) return l;
    const nx = Math.max(-l.w + MIN, Math.min(spec.w - MIN, Math.round(x)));
    const ny = Math.max(-l.h + MIN, Math.min(spec.h - MIN, Math.round(y)));
    return { ...l, x: nx, y: ny };
  });
}

/** Resize a layer with a minimum size. */
export function resizeLayer(layers: DesignLayer[], id: string, w: number, h: number): DesignLayer[] {
  return layers.map((l) =>
    l.id === id ? { ...l, w: Math.max(MIN, Math.round(w)), h: Math.max(MIN, Math.round(h)) } : l,
  );
}

// ── Z-order (render order = array order; last element is on top) ─────────────
function indexOf(layers: DesignLayer[], id: string): number {
  return layers.findIndex((l) => l.id === id);
}
function swap(layers: DesignLayer[], a: number, b: number): DesignLayer[] {
  const out = [...layers];
  const tmp = out[a]!;
  out[a] = out[b]!;
  out[b] = tmp;
  return out;
}
export function raise(layers: DesignLayer[], id: string): DesignLayer[] {
  const i = indexOf(layers, id);
  return i < 0 || i === layers.length - 1 ? layers : swap(layers, i, i + 1);
}
export function lower(layers: DesignLayer[], id: string): DesignLayer[] {
  const i = indexOf(layers, id);
  return i <= 0 ? layers : swap(layers, i, i - 1);
}
export function toFront(layers: DesignLayer[], id: string): DesignLayer[] {
  const i = indexOf(layers, id);
  if (i < 0) return layers;
  const out = [...layers];
  const [item] = out.splice(i, 1);
  out.push(item!);
  return out;
}
export function toBack(layers: DesignLayer[], id: string): DesignLayer[] {
  const i = indexOf(layers, id);
  if (i < 0) return layers;
  const out = [...layers];
  const [item] = out.splice(i, 1);
  out.unshift(item!);
  return out;
}

// ── SVG export (self-contained; safe to download or rasterize) ───────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textAnchor(align: DesignLayer["align"]): string {
  return align === "center" ? "middle" : align === "right" ? "end" : "start";
}
function textX(l: DesignLayer): number {
  return l.align === "center" ? l.x + l.w / 2 : l.align === "right" ? l.x + l.w : l.x;
}

/** Serialize a design to a standalone SVG string (canvas-unit coordinates). */
export function toSvg(design: Design): string {
  const spec = formatSpec(design.format);
  const parts: string[] = [];
  for (const l of design.layers) {
    if (l.type === "rect") {
      parts.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}" fill="${l.fill ?? "#000"}"/>`);
    } else if (l.type === "image") {
      if (l.src) {
        parts.push(`<clipPath id="c${l.id}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}"/></clipPath>`);
        parts.push(`<image href="${esc(l.src)}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${l.id})"/>`);
      } else {
        parts.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}" fill="${l.fill ?? "#1C2229"}"/>`);
      }
    } else if (l.type === "button") {
      parts.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius ?? 0}" fill="${l.fill ?? "#5B8DEF"}"/>`);
      parts.push(`<text x="${l.x + l.w / 2}" y="${l.y + l.h / 2}" font-family="Inter, sans-serif" font-size="${l.fontSize ?? 32}" font-weight="${l.weight ?? 700}" fill="${l.color ?? "#fff"}" text-anchor="middle" dominant-baseline="central">${esc(l.text ?? "")}</text>`);
    } else {
      parts.push(`<text x="${textX(l)}" y="${l.y + (l.fontSize ?? 40)}" font-family="Inter, sans-serif" font-size="${l.fontSize ?? 40}" font-weight="${l.weight ?? 600}" fill="${l.color ?? "#fff"}" text-anchor="${textAnchor(l.align)}">${esc(l.text ?? "")}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w}" height="${spec.h}" viewBox="0 0 ${spec.w} ${spec.h}"><rect width="${spec.w}" height="${spec.h}" fill="#0B0D10"/>${parts.join("")}</svg>`;
}
