import * as React from "react";
import { Images, Loader2, Search, X } from "lucide-react";
import type { CampaignAttachment, MediaAsset } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useMediaAssets } from "@/hooks/use-domain-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Shared attachment UI for campaigns / posts / "Publicar ahora":
 *  - <AttachmentRows>: the attached files with a real thumbnail (not a blank row).
 *  - <LibraryPickerButton>: "Elegir de la Biblioteca" → pick images already uploaded.
 */

export function AttachmentRows({
  attachments,
  onRemove,
}: {
  attachments: CampaignAttachment[];
  onRemove: (index: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {attachments.map((att, i) => (
        <div
          key={`${att.url ?? att.path ?? "att"}-${i}`}
          className="flex items-center gap-2 rounded-md bg-panel-raised px-2 py-1.5 text-xs"
        >
          {att.url && (att.kind ?? "image") === "image" ? (
            <img src={att.url} alt="" className="size-10 shrink-0 rounded object-cover" />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded bg-panel-high text-[10px] uppercase text-ink-faint">
              {att.kind ?? "img"}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-ink" title={att.url}>
            {att.filename || (att.url?.startsWith("data:") ? "Flyer generado" : att.url) || "Adjunto"}
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="rounded p-0.5 text-ink-faint hover:text-state-danger"
            title="Quitar"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

const assetToAttachment = (a: MediaAsset): CampaignAttachment => ({
  url: a.url,
  kind: a.type === "video" ? "video" : "image",
  mime: a.type === "video" ? "video/mp4" : "image/jpeg",
  filename: a.title,
});

export function LibraryPickerButton({
  onPick,
  className,
}: {
  onPick: (att: CampaignAttachment) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-soft bg-panel-raised px-3 py-2 text-xs text-ink-muted transition-colors hover:border-line-bright",
          className,
        )}
      >
        <Images className="size-4" /> Elegir de la Biblioteca
      </button>
      <LibraryPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(att) => {
          onPick(att);
          setOpen(false);
        }}
      />
    </>
  );
}

export function LibraryPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (att: CampaignAttachment) => void;
}) {
  const [q, setQ] = React.useState("");
  const assets = useMediaAssets({ q: q.trim() || undefined });
  const items = (assets.data?.items ?? []).filter((a) => a.url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Elegir de la Biblioteca</DialogTitle>
          <DialogDescription>
            Imágenes que ya subiste (Biblioteca). Haz clic en una para adjuntarla.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-9"
            aria-label="Buscar en la biblioteca"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {assets.isLoading ? (
            <div className="flex items-center justify-center py-10 text-ink-faint">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">
              Aún no hay imágenes en la Biblioteca. Sube una desde «Biblioteca» o con «Subir imagen».
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onPick(assetToAttachment(a))}
                  className="group overflow-hidden rounded-lg border border-line-soft bg-panel-raised text-left transition-colors hover:border-brand/60"
                  title={a.title}
                >
                  <img src={a.url} alt={a.title} className="aspect-square w-full object-cover" loading="lazy" />
                  <span className="block truncate px-2 py-1 text-[11px] text-ink-muted group-hover:text-ink">
                    {a.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
