"use client";

import { Image as ImageIcon, Upload } from "lucide-react";

import { useMediaAssets, useMediaFolders } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { QueryBoundary } from "@/components/common/query-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function BibliotecaPage() {
  const folders = useMediaFolders();
  const assets = useMediaAssets();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Media Manager"
        title="Biblioteca"
        description="Gestiona imágenes, videos y creatividades."
        actions={
          <Button size="sm">
            <Upload className="size-4" /> Subir
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
            ) : null}
          </div>
        </Panel>

        <QueryBoundary
          query={assets}
          skeleton={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          }
          isEmpty={(d) => d.items.length === 0}
          empty={{
            icon: ImageIcon,
            title: "Biblioteca vacía",
            description:
              "Sube tus primeras imágenes o videos para reutilizarlos en campañas y publicaciones.",
            action: (
              <Button size="sm">
                <Upload className="size-4" /> Subir archivos
              </Button>
            ),
          }}
        >
          {() => null}
        </QueryBoundary>
      </div>
    </div>
  );
}
