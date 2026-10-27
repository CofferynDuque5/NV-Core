import type { Automation, AutomationRun } from "@nv/domain";
import { History } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAutomationRuns } from "@/hooks/use-domain-data";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const STATUS: Record<AutomationRun["status"], { label: string; variant: "success" | "neutral" | "warning" | "danger" }> = {
  ok: { label: "Ejecutada", variant: "success" },
  skipped: { label: "Sin acciones", variant: "neutral" },
  waiting: { label: "En espera", variant: "warning" },
  error: { label: "Error", variant: "danger" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Real executions of a flow (not test runs): who triggered it, which steps ran
 * and why an action was skipped (anti-spam pause, opted-out contact…).
 */
export function AutomationRunsSheet({
  automation,
  onClose,
}: {
  automation: Automation | null;
  onClose: () => void;
}) {
  const runs = useAutomationRuns(automation?.id ?? null);

  return (
    <Sheet open={automation !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Historial · {automation?.name}</SheetTitle>
          <SheetDescription>Últimas 50 ejecuciones reales de los últimos 30 días.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {runs.isLoading ? (
            <ListSkeleton rows={4} />
          ) : runs.isError ? (
            <p className="text-xs text-state-danger">No se pudo cargar el historial.</p>
          ) : !runs.data || runs.data.length === 0 ? (
            <EmptyState
              icon={History}
              title="Sin ejecuciones todavía"
              description="Cuando llegue un mensaje que active este flujo, verás aquí cada paso y su resultado."
              compact
            />
          ) : (
            <ol className="space-y-3">
              {runs.data.map((r) => (
                <li key={r.id} className="rounded-xl border border-line-soft bg-panel-raised p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                      {r.contactName || r.contactHandle}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{when(r.startedAt)}</span>
                  </div>
                  {r.trigger === "resume" ? (
                    <p className="mt-1 text-[11px] text-ink-faint">Continuación tras un paso «Esperar».</p>
                  ) : r.trigger === "inactive" ? (
                    <p className="mt-1 text-[11px] text-ink-faint">Contacto sin escribir desde hace días.</p>
                  ) : null}
                  {r.error ? <p className="mt-1.5 text-xs text-state-danger">{r.error}</p> : null}
                  <ol className="mt-2 space-y-1 border-l border-line pl-3">
                    {r.steps.map((s, i) => (
                      <li key={`${s.nodeId}-${i}`} className="text-[11px] leading-snug">
                        <span className="font-medium text-ink">{s.label}</span>
                        {s.decision ? (
                          <span
                            className={cn(
                              "ml-1.5 rounded px-1 py-px text-[10px] font-semibold",
                              s.decision === "true"
                                ? "bg-state-success/15 text-state-success"
                                : "bg-state-danger/15 text-state-danger",
                            )}
                          >
                            {s.decision === "true" ? "Sí" : "No"}
                          </span>
                        ) : null}
                        <span className="text-ink-muted"> · {s.note}</span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
