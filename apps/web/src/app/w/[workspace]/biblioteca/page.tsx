import * as React from "react";
import {
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { CampaignAttachment, MediaAsset } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useMediaAssets, useMediaFolders, useMediaTags } from "@/hooks/use-domain-data";
import { useCreateFolder, useDeleteAsset, useUploadMedia } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SocialPublishDialog } from "@/components/entities/social-publish";
import { MediaEditDialog } from "@/components/entities/media-edit-dialog";

export default function BibliotecaPage() {
  const [folderId, setFolderId] = React.useState<string | undefined>(undefined);
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string | undefined>(undefined);

  const folders = useMediaFolders();
  const tags = useMediaTags();
  const assets = useMediaAssets({ folderId, q: q.trim() || undefined, tag });
  const upload = useUploadMedia();
  const createFolder = useCreateFolder();
  const del = useDeleteAsset();
  const confirm = useConfirm();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState<CampaignAttachment | null>(null);
  const [editing, setEditing] = React.useState<MediaAsset | null>(null);

  const folderList = folders.data ?? [];
  const tagList = tags.data ?? [];
  const items = assets.data?.items ?? [];
  const hasFilters = Boolean(folderId || q || tag);

  function pickFiles() {
    inputRef.current?.click();
  }
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    // Upload straight into the folder currently selected in the sidebar.
    for (const file of files) await upload.mutateAsync({ file, folderId }).catch(() => undefined);
  }
  function onCreateFolder() {
    const label = prompt("Nombre de la nueva carpeta/categoría:")?.trim();
    if (label) createFolder.mutate(label, { onSuccess: (f) => setFolderId(f.id) });
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
  function clearFilters() {
    setFolderId(undefined);
    setQ("");
    setTag(undefined);
  }

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
        description="Gestiona, busca y organiza imágenes y videos para reutilizarlos."
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
        {/* Folders */}
        <Panel className="h-fit">
          <PanelHeader
            title="Carpetas"
            action={
              <button
                onClick={onCreateFolder}
                disabled={createFolder.isPending}
                className="text-ink-muted hover:text-brand inline-flex items-center gap-1 text-xs disabled:opacity-60"
                title="Nueva carpeta"
              >
                {createFolder.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="size-3.5" />
                )}
                Nueva
              </button>
            }
          />
          <div className="p-2">
            <button
              onClick={() => setFolderId(undefined)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors",
                !folderId
                  ? "bg-panel-raised text-ink-bright"
                  : "text-ink-soft hover:bg-panel-raised",
              )}
            >
              <span>Todos los archivos</span>
              <span className="text-ink-faint text-xs">{assets.data?.total ?? ""}</span>
            </button>
            {folders.isLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {folderList.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => setFolderId(f.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors",
                        folderId === f.id
                          ? "bg-panel-raised text-ink-bright"
                          : "text-ink-soft hover:bg-panel-raised",
                      )}
                    >
                      <span className="truncate">{f.label}</span>
                      <span className="text-ink-faint text-xs">{f.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Search + tags + grid */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="text-ink-faint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título…"
                className="pl-9"
                aria-label="Buscar archivos"
              />
            </div>
            {hasFilters ? (
              <button
                onClick={clearFilters}
                className="border-line-soft text-ink-muted hover:text-brand inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs"
              >
                <X className="size-3.5" /> Limpiar
              </button>
            ) : null}
          </div>

          {tagList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tagList.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(tag === t ? undefined : t)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    tag === t
                      ? "border-brand/50 bg-brand/10 text-ink-bright"
                      : "border-line-soft text-ink-muted hover:border-line-bright",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}

          {assets.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title={hasFilters ? "Sin resultados" : "Biblioteca vacía"}
              description={
                hasFilters
                  ? "Ningún archivo coincide con los filtros. Prueba a limpiarlos."
                  : "Sube tus primeras imágenes o videos para reutilizarlos en campañas y publicaciones."
              }
              action={
                hasFilters ? (
                  <Button size="sm" variant="secondary" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : (
                  <Button size="sm" onClick={pickFiles} disabled={upload.isPending}>
                    <Upload className="size-4" /> Subir archivos
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((asset) => (
                <div
                  key={asset.id}
                  className="border-line-soft bg-panel group relative overflow-hidden rounded-xl border"
                >
                  <div className="bg-panel-raised aspect-square">
                    {asset.url ? (
                      asset.type === "video" ? (
                        <video src={asset.url} className="size-full object-cover" muted />
                      ) : (
                        <img
                          src={asset.url}
                          alt={asset.title}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      )
                    ) : (
                      <div className="text-ink-faint grid size-full place-items-center">
                        <ImageIcon className="size-8" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-soft truncate text-xs" title={asset.title}>
                        {asset.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={() => setEditing(asset)}
                          className="text-ink-faint hover:text-ink grid size-6 place-items-center rounded-md transition-colors"
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {asset.url ? (
                          <button
                            onClick={() =>
                              setPublishing({
                                url: asset.url!,
                                kind: asset.type === "video" ? "video" : "image",
                                filename: asset.title,
                              })
                            }
                            className="text-ink-faint hover:text-brand grid size-6 place-items-center rounded-md transition-colors"
                            title="Publicar en redes"
                          >
                            <Send className="size-3.5" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => remove(asset.id, asset.title)}
                          disabled={deletingId === asset.id}
                          className="text-ink-faint hover:text-state-danger grid size-6 place-items-center rounded-md transition-colors"
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
                    {asset.tag ? (
                      <span className="bg-panel-raised text-ink-muted inline-block rounded px-1.5 py-0.5 text-[10px]">
                        {asset.tag}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SocialPublishDialog
        open={publishing !== null}
        onOpenChange={(v) => {
          if (!v) setPublishing(null);
        }}
        initialAttachments={publishing ? [publishing] : []}
      />
      <MediaEditDialog
        asset={editing}
        folders={folderList}
        open={editing !== null}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      />
    </div>
  );
}
