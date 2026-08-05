
import * as React from "react";
import type { Campaign } from "@nv/domain";
import { Loader2, Megaphone, Pause, Pencil, Play, Plus, Send, Trash2 } from "lucide-react";

import { EMPTY_METRIC } from "@/lib/utils";
import { useCampaigns } from "@/hooks/use-domain-data";
import {
  useDeleteCampaign,
  usePauseCampaign,
  useResumeCampaign,
  useRunCampaign,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelStack } from "@/components/common/channel-badge";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";

const STATUS_VARIANT: Record<Campaign["status"], "default" | "success" | "warning" | "neutral"> = {
  activa: "success",
  programada: "warning",
  pausada: "neutral",
  borrador: "neutral",
  completada: "default",
};

export function CampanasContent({ showHeader = true }: { showHeader?: boolean }) {
  const campaigns = useCampaigns();
  const del = useDeleteCampaign();
  const run = useRunCampaign();
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Campaign | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

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
    <Button size="sm" onClick={openCreate}>
      <Plus className="size-4" /> Nueva campaña
    </Button>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((c) => (
              <Panel key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink-bright">{c.name}</h3>
                    <div className="mt-1">
                      <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => run.mutate(c.id)}
                      disabled={run.isPending && run.variables === c.id}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-success/10 hover:text-state-success"
                      title="Enviar ahora"
                    >
                      {run.isPending && run.variables === c.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                    </button>
                    {c.status === "pausada" ? (
                      <button
                        onClick={() => resume.mutate(c.id)}
                        className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-high hover:text-ink"
                        title="Reanudar"
                      >
                        <Play className="size-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => pause.mutate(c.id)}
                        className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-high hover:text-ink"
                        title="Pausar"
                      >
                        <Pause className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-high hover:text-ink"
                      title="Editar"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => remove(c)}
                      disabled={deletingId === c.id}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                      title="Eliminar"
                    >
                      {deletingId === c.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                {c.channels.length > 0 ? <ChannelStack ids={c.channels} /> : null}

                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-ink-faint">
                    <span>Progreso</span>
                    <span>{c.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-brand-violet"
                      style={{ width: `${c.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between border-t border-line pt-2 text-xs text-ink-muted">
                  <span>Alcance {c.reach ?? EMPTY_METRIC}</span>
                  <span>CTR {c.ctr ?? EMPTY_METRIC}</span>
                  <span>{c.posts} posts</span>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </QueryBoundary>

      <CampaignFormDialog open={dialogOpen} onOpenChange={setDialogOpen} campaign={editing} />
    </div>
  );
}
