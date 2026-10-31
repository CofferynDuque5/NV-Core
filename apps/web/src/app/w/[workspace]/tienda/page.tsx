import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, ImageOff, Megaphone, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Campaign, Product } from "@nv/domain";

import { useProducts } from "@/hooks/use-domain-data";
import { useDeleteProduct } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { filterProducts, priceLine, productCategories, productMessage } from "@/lib/products";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductDialog } from "@/components/entities/product-dialog";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";

type Draft = Pick<Campaign, "name" | "message" | "prices" | "attachments">;

const chip = (on: boolean) =>
  cn(
    "rounded-full border px-2.5 py-1 text-xs transition-colors",
    on
      ? "border-brand/60 bg-brand/10 text-ink"
      : "border-line-soft text-ink-muted hover:border-line-bright",
  );

/** Plain text of a product to paste anywhere (prices written out, not {{precio}}). */
function shareText(p: Product): string {
  return [`*${p.name}*`, p.description?.trim(), priceLine(p) ? `Precio: ${priceLine(p)}` : null]
    .filter(Boolean)
    .join("\n");
}

function ProductCard({
  p,
  onEdit,
  onCampaign,
  onDelete,
}: {
  p: Product;
  onEdit: () => void;
  onCampaign: () => void;
  onDelete: () => void;
}) {
  const cover = p.images[0]?.url;
  const prices = priceLine(p);
  return (
    <Panel
      className={cn("flex flex-col overflow-hidden", !p.active && "opacity-70")}
      data-testid="product-card"
    >
      <div className="bg-panel-raised relative aspect-[4/3]">
        {cover ? (
          <img src={cover} alt={p.name} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="text-ink-faint grid size-full place-items-center">
            <ImageOff className="size-8" />
          </div>
        )}
        {!p.active ? (
          <Badge variant="neutral" className="absolute left-2 top-2">
            No disponible
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          {p.category ? (
            <p className="text-ink-faint text-[11px] uppercase tracking-wide">{p.category}</p>
          ) : null}
          <h3 className="text-ink-bright truncate text-sm font-semibold">{p.name}</h3>
          {p.description ? (
            <p className="text-ink-muted mt-1 line-clamp-3 text-xs">{p.description}</p>
          ) : null}
        </div>
        <p className={cn("text-sm font-semibold", prices ? "text-ink" : "text-state-warning")}>
          {prices || "Sin precio"}
        </p>
        <div className="text-ink-faint flex flex-wrap items-center gap-x-3 text-[11px]">
          {p.sku ? <span>Código {p.sku}</span> : null}
          {p.stock != null ? (
            <span className={p.stock === 0 ? "text-state-danger" : ""}>Stock {p.stock}</span>
          ) : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          <Button size="sm" variant="secondary" onClick={onCampaign}>
            <Megaphone className="size-3.5" /> Crear campaña
          </Button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(shareText(p))
                .then(() => toast.success("Texto copiado."))
                .catch(() => toast.error("No se pudo copiar."));
            }}
            className="text-ink-faint hover:bg-panel-high hover:text-ink rounded-md p-1.5"
            title="Copiar texto"
            aria-label={`Copiar texto de ${p.name}`}
          >
            <Copy className="size-4" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="text-ink-faint hover:bg-panel-high hover:text-ink rounded-md p-1.5"
            title="Editar"
            aria-label={`Editar ${p.name}`}
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-ink-faint hover:bg-state-danger/10 hover:text-state-danger rounded-md p-1.5"
            title="Eliminar"
            aria-label={`Eliminar ${p.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </Panel>
  );
}

export default function TiendaPage() {
  const products = useProducts();
  const del = useDeleteProduct();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [searchParams] = useSearchParams();
  const [q, setQ] = React.useState(() => searchParams.get("q") ?? "");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState<"" | "activos" | "pausados">("");

  const items = products.data ?? [];
  const cats = productCategories(items);
  const visible = filterProducts(items, { q, category, status });

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  async function remove(p: Product) {
    const ok = await confirm({
      title: `Eliminar «${p.name}»`,
      description: "Se quita de la Tienda. Las campañas ya creadas no cambian.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) del.mutate(p.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Tienda"
        description="Tu catálogo: productos, descripciones y precios en cada moneda. Desde aquí creas campañas en un clic."
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" /> Nuevo producto
          </Button>
        }
      />

      {products.isLoading ? (
        <CardGridSkeleton />
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={ShoppingBag}
            title="Tu Tienda está vacía"
            description="Agrega lo que vendes con su descripción y precios. Luego conviértelo en campaña: el precio sale en la moneda de cada grupo."
            action={
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" /> Agregar el primero
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto…"
              className="h-9 w-full max-w-xs"
            />
            {(["", "activos", "pausados"] as const).map((s) => (
              <button
                key={s || "todos"}
                type="button"
                onClick={() => setStatus(s)}
                className={chip(status === s)}
              >
                {s === "" ? "Todos" : s === "activos" ? "Disponibles" : "No disponibles"}
              </button>
            ))}
            <span className="text-ink-faint ml-auto text-xs">
              {visible.length} de {items.length}
            </span>
          </div>
          {cats.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={chip(category === "")}
              >
                Todas
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={chip(category === c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="text-ink-faint py-8 text-center text-sm">Sin productos que coincidan.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  onEdit={() => {
                    setEditing(p);
                    setDialogOpen(true);
                  }}
                  onCampaign={() =>
                    setDraft({
                      name: p.name,
                      message: productMessage(p),
                      prices: p.prices,
                      attachments: p.images.slice(0, 1),
                    })
                  }
                  onDelete={() => void remove(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        categories={cats}
      />
      <CampaignFormDialog
        open={draft !== null}
        onOpenChange={(v) => !v && setDraft(null)}
        campaign={null}
        draft={draft}
      />
    </div>
  );
}
