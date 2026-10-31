
import * as React from "react";
import type { Campaign } from "@nv/domain";
import { Download, Loader2, Megaphone, Plus, Upload } from "lucide-react";

import type { CampaignTab } from "@/lib/campaigns";
import { useCampaigns } from "@/hooks/use-domain-data";
import {
  useDeleteCampaign,
  useDuplicateCampaign,
  useExportCampaigns,
  useImportCampaigns,
  usePauseCampaign,
  useResumeCampaign,
  useRunCampaign,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";
import { CampaignBoard, CampaignRow } from "./campaign-board";

export function CampanasContent({ showHeader = true }: { showHeader?: boolean }) {
  const campaigns = useCampaigns();
  const del = useDeleteCampaign();
  const run = useRunCampaign();
  const duplicate = useDuplicateCampaign();
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();
  const exportCampaigns = useExportCampaigns();
  const importCampaigns = useImportCampaigns();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Campaign | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importCsvText, setImportCsvText] = React.useState("");
  const [tab, setTab] = React.useState<CampaignTab | null>(null);
  // null = every category; NO_CATEGORY ("") = only the ones without one.
  const [category, setCategory] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const hasItems = (campaigns.data?.items.length ?? 0) > 0;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: Campaign) {
    setEditing(c);
    setDialogOpen(true);
  }
  async function remove(c: Campaign) {
    const ok = await confirm({
      title: "Eliminar campaña",
      description: `¿Eliminar "${c.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(c.id);
    del.mutate(c.id, { onSettled: () => setDeletingId(null) });
  }

  const actions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => exportCampaigns.mutate()}
        disabled={!hasItems || exportCampaigns.isPending}
      >
        {exportCampaigns.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}{" "}
        Exportar
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="size-4" /> Importar
      </Button>
      <Button size="sm" onClick={openCreate}>
        <Plus className="size-4" /> Nueva campaña
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow="Operaciones"
          title="Campañas"
          description="Planifica, lanza y monitorea tus campañas omnicanal."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}

      <QueryBoundary
        query={campaigns}
        skeleton={<CardGridSkeleton count={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Megaphone,
          title: "Aún no hay campañas",
          description:
            "Crea tu primera campaña para empezar a publicar en WhatsApp, Instagram, Facebook, TikTok y más desde un solo lugar.",
          action: (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nueva campaña
            </Button>
          ),
        }}
      >
        {(data) => (
          <CampaignBoard
            items={data.items}
            tab={tab}
            onTab={setTab}
            category={category}
            onCategory={setCategory}
            query={query}
            onQuery={setQuery}
            renderRow={(c) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                running={run.isPending && run.variables === c.id}
                duplicating={duplicate.isPending && duplicate.variables === c.id}
                deleting={deletingId === c.id}
                onRun={() => run.mutate(c.id)}
                onPause={() => pause.mutate(c.id)}
                onResume={() => resume.mutate(c.id)}
                onEdit={() => openEdit(c)}
                onDuplicate={() => duplicate.mutate(c.id)}
                onDelete={() => remove(c)}
              />
            )}
          />
        )}
      </QueryBoundary>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar campañas (CSV)</DialogTitle>
            <DialogDescription>
              Columnas: <code>name, status, channels, message, scheduleType, scheduleAt,
              scheduleDays, targets</code>. Los <code>targets</code> son nombres de grupos existentes
              (separados por <code>;</code>). Las campañas se importan como borrador; los grupos que
              no existan se omiten y se listan como avisos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel-high file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-panel-raised"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImportCsvText(await file.text());
              }}
            />
            <Textarea
              placeholder="…o pega aquí el contenido CSV"
              rows={6}
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!importCsvText.trim() || importCampaigns.isPending}
              onClick={() =>
                importCampaigns.mutate(importCsvText, {
                  onSuccess: () => {
                    setImportOpen(false);
                    setImportCsvText("");
                  },
                })
              }
            >
              {importCampaigns.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampaignFormDialog open={dialogOpen} onOpenChange={setDialogOpen} campaign={editing} />
    </div>
  );
}
