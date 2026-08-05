import * as React from "react";
import type { MediaAsset, MediaFolder } from "@nv/domain";

import { useUpdateAsset } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Rename / retag / move a media asset — the everyday organizing actions, in one
 * place. Reuses the FormDialog pattern and the S-media PATCH endpoint.
 */
export function MediaEditDialog({
  asset,
  folders,
  open,
  onOpenChange,
}: {
  asset: MediaAsset | null;
  folders: MediaFolder[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useUpdateAsset();
  const [title, setTitle] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [folderId, setFolderId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !asset) return;
    setTitle(asset.title);
    setTag(asset.tag ?? "");
    setFolderId(asset.folderId ?? "");
    setError(null);
  }, [open, asset]);

  function submit() {
    if (!asset) return;
    setError(null);
    mutation.mutate(
      { id: asset.id, input: { title: title.trim(), tag: tag.trim(), folderId } },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar archivo"
      description="Renombra, etiqueta o mueve este archivo."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Guardar"
    >
      <div className="space-y-1.5">
        <Label htmlFor="me-title">Título</Label>
        <Input id="me-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="me-tag">Etiqueta</Label>
          <Input
            id="me-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="p. ej. producto"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="me-folder">Carpeta</Label>
          <select
            id="me-folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            <option value="">Sin carpeta</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </FormDialog>
  );
}
