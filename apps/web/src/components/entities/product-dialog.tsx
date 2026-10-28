import * as React from "react";
import { Loader2, Paperclip } from "lucide-react";
import type { CampaignAttachment, Product } from "@nv/domain";

import { useSaveProduct, useUploadCampaignAttachment } from "@/hooks/use-domain-mutations";
import { STORE_CURRENCIES, currencyLabel } from "@/lib/products";
import { FormDialog, errorMessage } from "./form-dialog";
import { AttachmentRows, LibraryPickerButton } from "./attachment-tools";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Create or edit a product of the Tienda. `product` null = new. */
export function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  categories: string[];
}) {
  const save = useSaveProduct();
  const upload = useUploadCampaignAttachment();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [images, setImages] = React.useState<CampaignAttachment[]>([]);
  const [sku, setSku] = React.useState("");
  const [stock, setStock] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [showAll, setShowAll] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setCategory(product?.category ?? "");
    setPrices(product?.prices ?? {});
    setImages(product?.images ?? []);
    setSku(product?.sku ?? "");
    setStock(product?.stock != null ? String(product.stock) : "");
    setActive(product?.active ?? true);
    setShowAll(false);
    setError(null);
  }, [open, product]);

  // The four common currencies always show; the rest on demand or when filled.
  const currencies = STORE_CURRENCIES.filter((c, i) => showAll || i < 4 || prices[c]?.trim());

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      try {
        const att = await upload.mutateAsync(f);
        setImages((p) => [...p, att]);
      } catch {
        /* toast in the hook */
      }
    }
  }

  const submit = () => {
    setError(null);
    const n = stock.trim() === "" ? null : Number(stock);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      setError("El stock debe ser un número entero, o vacío si no lo controlas.");
      return;
    }
    save.mutate(
      {
        id: product?.id,
        input: {
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => v.trim())),
          images,
          sku: sku.trim() || null,
          stock: n,
          active,
        },
      },
      { onSuccess: () => onOpenChange(false), onError: (err) => setError(errorMessage(err)) },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? "Editar producto" : "Nuevo producto"}
      description="Lo que vendes, con su descripción y su precio en cada moneda."
      onSubmit={submit}
      pending={save.isPending}
      error={error}
      size="lg"
      submitLabel={product ? "Guardar" : "Agregar a la Tienda"}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pr-name">Nombre</Label>
          <Input
            id="pr-name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-category">Categoría</Label>
          <Input
            id="pr-category"
            list="pr-categories"
            maxLength={60}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ej: Streaming"
          />
          <datalist id="pr-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pr-description">Descripción</Label>
        <Textarea
          id="pr-description"
          rows={4}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qué incluye, condiciones, tiempo de entrega…"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Precios</Label>
        <p className="text-ink-faint text-[11px]">
          Escribe solo los que uses. No convertimos monedas.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {currencies.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Label htmlFor={`pr-price-${c}`} className="text-ink-muted w-36 shrink-0 text-xs">
                {currencyLabel(c)}
              </Label>
              <Input
                id={`pr-price-${c}`}
                inputMode="decimal"
                className="h-8"
                value={prices[c] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [c]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {!showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-brand text-xs hover:underline"
          >
            Más monedas
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pr-sku">Código (opcional)</Label>
          <Input id="pr-sku" maxLength={60} value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-stock">Stock (opcional)</Label>
          <Input
            id="pr-stock"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Sin controlar"
          />
        </div>
        <label className="text-ink flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[#5F86F2]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Disponible
        </label>
      </div>
      <div className="space-y-1.5">
        <Label>Fotos</Label>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending || images.length >= 10}
          className="border-line-soft bg-panel-raised text-ink-muted hover:border-line-bright flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors disabled:opacity-60"
        >
          {upload.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
          {upload.isPending ? "Subiendo…" : "Subir fotos"}
        </button>
        <LibraryPickerButton onPick={(att) => setImages((p) => [...p, att].slice(0, 10))} />
        <AttachmentRows
          attachments={images}
          onRemove={(i) => setImages((p) => p.filter((_, j) => j !== i))}
        />
        <p className="text-ink-faint text-[11px]">
          La primera es la portada y la que se usa en campañas.
        </p>
      </div>
    </FormDialog>
  );
}
