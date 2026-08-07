import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StatusLevel } from "@nv/domain";

import { useSystemStatus } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { ListSkeleton } from "@/components/common/skeletons";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";

const LEVEL_META: Record<
  StatusLevel,
  { label: string; icon: LucideIcon; color: string }
> = {
  operational: { label: "Operativo", icon: CheckCircle2, color: "#3FB950" },
  degraded: { label: "Degradado", icon: AlertTriangle, color: "#E3B341" },
  down: { label: "Caído", icon: XCircle, color: "#F85149" },
  unknown: { label: "Desconocido", icon: HelpCircle, color: "#8B949E" },
};

const OVERALL_HEADLINE: Record<StatusLevel, string> = {
  operational: "Todos los sistemas operativos",
  degraded: "Rendimiento degradado en algún sistema",
  down: "Interrupción del servicio",
  unknown: "Estado no disponible",
};

export default function EstadoPage() {
  const status = useSystemStatus();
  const data = status.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Estado del servicio"
        description="Salud en tiempo real de la plataforma. Se actualiza automáticamente."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => status.refetch()}
            disabled={status.isFetching}
          >
            <RefreshCw className={status.isFetching ? "size-4 animate-spin" : "size-4"} /> Actualizar
          </Button>
        }
      />

      {status.isLoading ? (
        <ListSkeleton rows={4} />
      ) : status.isError || !data ? (
        <ErrorState
          title="No se pudo obtener el estado"
          description="No pudimos contactar con el servicio de estado. Vuelve a intentarlo."
          onRetry={() => status.refetch()}
        />
      ) : (
        <>
          {/* Overall banner */}
          {(() => {
            const meta = LEVEL_META[data.overall];
            return (
              <Panel
                className="flex items-center gap-4 p-5"
                style={{ borderColor: `${meta.color}55` }}
              >
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-xl"
                  style={{ background: `${meta.color}22`, color: meta.color }}
                >
                  <meta.icon className="size-6" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink-bright">
                    {OVERALL_HEADLINE[data.overall]}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Última comprobación:{" "}
                    {new Date(data.timestamp).toLocaleString("es-ES", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </Panel>
            );
          })()}

          {/* Components */}
          <Panel className="divide-y divide-line-soft">
            {data.components.map((c) => {
              const meta = LEVEL_META[c.status];
              return (
                <div key={c.key} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{c.name}</div>
                    {c.detail ? <div className="text-xs text-ink-faint">{c.detail}</div> : null}
                  </div>
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: `${meta.color}1f`, color: meta.color }}
                  >
                    <meta.icon className="size-3.5" />
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </Panel>

          <p className="text-xs text-ink-faint">
            Este estado refleja comprobaciones reales de cada componente; no se muestran métricas
            ficticias.
          </p>
        </>
      )}
    </div>
  );
}
