import * as React from "react";
import type { CampaignItem } from "@nv/domain";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Package, Plus, Trash2 } from "lucide-react";

import { useProducts } from "@/hooks/use-domain-data";
import { useUploadCampaignAttachment } from "@/hooks/use-domain-mutations";
import { productMessage } from "@/lib/products";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const MAX_CAMPAIGN_ITEMS = 10;

/**
 * «Productos, cada uno en su mensaje»: after the main message, each product goes
 * to every group as its own message with its own text and image (a few seconds
 * apart). {{precio}} in each text uses that product's prices.
 */
export function CampaignItemsEditor({
  items,
  onChange,
}: {
  items: CampaignItem[];
  onChange: (items: CampaignItem[]) => void;
}) {
  const products = useProducts();
  const active = (products.data ?? []).filter((p) => p.active);
  const full = items.length >= MAX_CAMPAIGN_ITEMS;

  const set = (i: number, patch: Partial<CampaignItem>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  function addProduct(id: string) {
    const p = active.find((x) => x.id === id);
    if (!p || full) return;
    onChange([
      ...items,
      {
        productId: p.id,
        name: p.name,
        text: productMessage(p),
        attachments: p.images[0] ? [p.images[0]] : [],
        prices: p.prices,
      },
    ]);
  }

  function addAll() {
    const have = new Set(items.map((i) => i.productId).filter(Boolean));
    const add = active
      .filter((p) => !have.has(p.id))
      .slice(0, MAX_CAMPAIGN_ITEMS - items.length)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        text: productMessage(p),
        attachments: p.images[0] ? [p.images[0]] : [],
        prices: p.prices,
      }));
    onChange([...items, ...add]);
  }

  return (
    <div className="space-y-2" data-testid="campaign-items">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Productos, cada uno en su mensaje</Label>
        <span className="text-ink-faint text-[11px]">
          {items.length}/{MAX_CAMPAIGN_ITEMS}
        </span>
      </div>
      <p className="text-ink-faint text-[11px]">
        Cada producto se envía a cada grupo como un mensaje aparte, con su texto y su imagen, unos segundos después del
        mensaje principal. <code className="text-ink-muted">{"{{precio}}"}</code> usa el precio de ese producto en la
        moneda del grupo.
      </p>
      {items.map((it, i) => (
        <ItemCard
          key={i}
          index={i}
          item={it}
          count={items.length}
          onChange={(patch) => set(i, patch)}
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
          onMove={(d) => move(i, d)}
        />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {active.length > 0 ? (
          <select
            aria-label="Añadir producto de la Tienda"
            value=""
            disabled={full}
            onChange={(e) => addProduct(e.target.value)}
            data-testid="campaign-item-add-product"
            className="border-line-soft bg-panel-raised text-ink-muted h-8 max-w-[14rem] rounded-md border px-2 text-xs"
          >
            <option value="">+ Producto de la Tienda…</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
        {active.length > 1 ? (
          <button
            type="button"
            disabled={full}
            onClick={addAll}
            className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
          >
            <Package className="size-3.5" /> Todos los productos
          </button>
        ) : null}
        <button
          type="button"
          disabled={full}
          onClick={() => onChange([...items, { name: `Producto ${items.length + 1}`, text: "", attachments: [], prices: {} }])}
          data-testid="campaign-item-add"
          className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Escribir uno a mano
        </button>
      </div>
    </div>
  );
}

function ItemCard({
  index,
  item,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  item: CampaignItem;
  count: number;
  onChange: (patch: Partial<CampaignItem>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const upload = useUploadCampaignAttachment();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const image = item.attachments?.[0];
  const prices = Object.entries(item.prices ?? {}).filter(([, v]) => v);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const att = await upload.mutateAsync(file);
      onChange({ attachments: [att] });
    } catch {
      /* toast in the hook */
    }
  }

  return (
    <div className="border-line-soft bg-panel-raised grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[5.5rem_1fr]" data-testid="campaign-item">
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="border-line-soft bg-panel text-ink-faint hover:border-brand/60 relative grid size-[5.5rem] place-items-center overflow-hidden rounded-md border border-dashed"
          aria-label={image ? "Cambiar imagen" : "Añadir imagen"}
        >
          {upload.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : image?.kind === "image" || image?.mime?.startsWith("image/") ? (
            <img src={image.url} alt="" className="size-full object-cover" />
          ) : image ? (
            <span className="px-1 text-center text-[10px]">{image.filename ?? "Adjunto"}</span>
          ) : (
            <ImagePlus className="size-5" />
          )}
        </button>
        {image ? (
          <button type="button" onClick={() => onChange({ attachments: [] })} className="text-ink-faint hover:text-ink text-[10px]">
            Quitar imagen
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={onPick}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="bg-brand/15 text-brand grid size-5 shrink-0 place-items-center rounded text-[10px] font-semibold">
            {index + 1}
          </span>
          <Input
            aria-label={`Nombre del producto ${index + 1}`}
            value={item.name}
            maxLength={80}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-7 text-xs"
          />
          <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => onMove(-1)} className="text-ink-faint hover:text-ink rounded p-1 disabled:opacity-30">
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" aria-label="Bajar" disabled={index === count - 1} onClick={() => onMove(1)} className="text-ink-faint hover:text-ink rounded p-1 disabled:opacity-30">
            <ArrowDown className="size-3.5" />
          </button>
          <button type="button" aria-label="Quitar producto" onClick={onRemove} className="text-state-danger rounded p-1 hover:bg-state-danger/10">
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <Textarea
          aria-label={`Texto del producto ${index + 1}`}
          value={item.text}
          rows={3}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="*Nombre del producto*\nDescripción\nPrecio: {{precio}}"
          className="text-xs"
        />
        {prices.length > 0 ? (
          <p className="text-ink-faint text-[10px]">
            Precios: {prices.map(([k, v]) => `${k} ${v}`).join(" · ")}
          </p>
        ) : item.text.includes("{{") && /\{\{\s*precio\s*\}\}/.test(item.text) ? (
          <p className="text-state-warning text-[10px]">
            Este producto no tiene precios: {"{{precio}}"} usará los precios de la campaña.
          </p>
        ) : null}
      </div>
    </div>
  );
}
