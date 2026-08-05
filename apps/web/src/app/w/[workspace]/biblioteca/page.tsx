
import * as React from "react";
import { Image as ImageIcon, Loader2, Send, Trash2, Upload } from "lucide-react";
import type { CampaignAttachment } from "@nv/domain";

import { useMediaAssets, useMediaFolders } from "@/hooks/use-domain-data";
import { useDeleteAsset, useUploadMedia } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SocialPublishDialog } from "@/components/entities/social-publish";

export default function BibliotecaPage() {
  const folders = useMediaFolders();
  const assets = useMediaAssets();
  const upload = useUploadMedia();
  const del = useDeleteAsset();
  const confirm = useConfirm();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState<CampaignAttachment | null>(null);

  function pickFiles() {
    inputRef.current?.click();
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      await upload.mutateAsync(file).catch(() => undefined);
    }
  }

  async function remove(id: string, title: string) {
    const ok = await confirm({
      title: "Eliminar archivo",
      description: `¿Eliminar "${title}" de la biblioteca?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    del.mutate(id, { onSettled: () => setDeletingId(null) });
  }

  const items = assets.data?.items ?? [];

  return (
    <div className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onFiles}
      />
      <PageHeader
        eyebrow="Media Manager"
        title="Biblioteca"
        description="Gestiona imágenes, videos y creatividades."
        actions={
          <Button size="sm" onClick={pickFiles} disabled={upload.isPending}>
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Subir
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <Panel className="h-fit">
          <PanelHeader title="Carpetas" />
          <div className="p-3">
            {folders.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : (folders.data ?? []).length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-ink-muted">Aún no hay carpetas.</p>
            ) : (
              <ul className="space-y-1">
                {(folders.data ?? []).map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-ink-soft"
                  >
                    <span className="truncate">{f.label}</span>
                    <span className="text-xs text-ink-faint">{f.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {assets.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="Biblioteca vacía"
            description="Sube tus primeras imágenes o videos para reutilizarlos en campañas y publicaciones."
            action={
              <Button size="sm" onClick={pickFiles} disabled={upload.isPending}>
                <Upload className="size-4" /> Subir archivos
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((asset) => (
              <div
                key={asset.id}
                className="group relative overflow-hidden rounded-xl border border-line-soft bg-panel"
              >
                <div className="aspect-square bg-panel-raised">
                  {asset.url ? (
                    asset.type === "video" ? (
                      <video src={asset.url} className="size-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.url} alt={asset.title} className="size-full object-cover" />
                    )
                  ) : (
                    <div className="grid size-full place-items-center text-ink-faint">
                      <ImageIcon className="size-8" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="truncate text-xs text-ink-soft" title={asset.title}>
                    {asset.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {asset.url ? (
                      <button
                        onClick={() =>
                          setPublishing({
                            url: asset.url!,
                            kind: asset.type === "video" ? "video" : "image",
                            filename: asset.title,
                          })
                        }
                        className="grid size-6 place-items-center rounded-md text-ink-faint transition-colors hover:text-brand"
                        title="Publicar en redes"
                      >
                        <Send className="size-3.5" />
                      </button>
                    ) : null}
                    <button
                      onClick={() => remove(asset.id, asset.title)}
                      disabled={deletingId === asset.id}
                      className="grid size-6 place-items-center rounded-md text-ink-faint transition-colors hover:text-state-danger"
                      title="Eliminar"
                    >
                      {deletingId === asset.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SocialPublishDialog
        open={publishing !== null}
        onOpenChange={(v) => {
          if (!v) setPublishing(null);
        }}
        initialAttachments={publishing ? [publishing] : []}
      />
    </div>
  );
}
