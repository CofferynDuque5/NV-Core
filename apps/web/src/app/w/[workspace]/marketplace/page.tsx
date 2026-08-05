
import * as React from "react";
import { CheckCircle2, Plug, Store } from "lucide-react";

import { useIntegrations } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Input } from "@/components/ui/input";

export default function MarketplacePage() {
  const integrations = useIntegrations();
  const [query, setQuery] = React.useState("");

  const all = integrations.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      )
    : all;

  const connectedCount = all.filter((i) => i.connected).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integraciones"
        title="Marketplace"
        description={
          all.length > 0
            ? `${connectedCount} de ${all.length} integraciones conectadas.`
            : "Conecta NV Core con tus herramientas favoritas."
        }
      />

      <Input
        placeholder="Buscar integraciones…"
        className="max-w-xs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {integrations.isLoading ? (
        <CardGridSkeleton count={9} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Catálogo no disponible"
          description="Conecta el backend para ver el catálogo de integraciones."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin resultados"
          description={`No encontramos integraciones para «${query}».`}
          compact
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <div
              key={i.id}
              className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white"
                  style={{ background: `hsl(${i.hue ?? 220} 60% 45%)` }}
                >
                  {i.name.slice(0, 2)}
                </div>
                {i.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-state-success/10 px-2 py-0.5 text-[11px] font-medium text-state-success">
                    <CheckCircle2 className="size-3" /> Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-panel-raised px-2 py-0.5 text-[11px] font-medium text-ink-faint">
                    <Plug className="size-3" /> Disponible
                  </span>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-bright">{i.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-ink-faint">
                  {i.category}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">{i.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
