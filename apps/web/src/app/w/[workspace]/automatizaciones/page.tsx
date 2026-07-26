"use client";

import * as React from "react";
import { Loader2, Play, Plus, Trash2, Workflow } from "lucide-react";

import { useAutomations } from "@/hooks/use-domain-data";
import { useDeleteAutomation, useRunAutomation } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { ListSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutomationCreateDialog } from "@/components/entities/automation-create-dialog";

export default function AutomatizacionesPage() {
  const automations = useAutomations();
  const del = useDeleteAutomation();
  const run = useRunAutomation();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);

  function trigger(id: string) {
    setRunningId(id);
    run.mutate(id, { onSettled: () => setRunningId(null) });
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: "Eliminar automatización",
      description: `¿Eliminar el flujo "${name}"?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    del.mutate(id, { onSettled: () => setDeletingId(null) });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sin código"
        title="Automatizaciones"
        description="Crea flujos que trabajan por ti: triggers, acciones, esperas y condiciones."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Nuevo flujo
          </Button>
        }
      />

      <QueryBoundary
        query={automations}
        skeleton={<ListSkeleton rows={4} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Workflow,
          title: "Sin automatizaciones",
          description:
            "Diseña tu primer flujo (ej. compra → onboarding, renovación → recordatorio). Se ejecutará con n8n cuando conectes el backend.",
          action: (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nuevo flujo
            </Button>
          ),
        }}
      >
        {(data) => (
          <div className="space-y-2">
            {data.items.map((a) => (
              <Panel key={a.id} className="flex items-center gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
                  <Workflow className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink-bright">{a.name}</span>
                    <Badge variant={a.status === "activo" ? "success" : "neutral"}>{a.status}</Badge>
                  </div>
                  {a.description ? (
                    <p className="truncate text-xs text-ink-muted">{a.description}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-ink-faint">{a.runs} ejecuciones</span>
                {a.webhookUrl ? (
                  <button
                    onClick={() => trigger(a.id)}
                    disabled={runningId === a.id}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
                    title="Ejecutar ahora (n8n)"
                  >
                    {runningId === a.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    Ejecutar
                  </button>
                ) : null}
                <button
                  onClick={() => remove(a.id, a.name)}
                  disabled={deletingId === a.id}
                  className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                  title="Eliminar"
                >
                  {deletingId === a.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </Panel>
            ))}
          </div>
        )}
      </QueryBoundary>

      <AutomationCreateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
