
import * as React from "react";
import { Check, Download, Loader2, Store, Trash2 } from "lucide-react";
import type { MarketplaceEntry } from "@nv/domain";

import { useMarketplace } from "@/hooks/use-domain-data";
import { useInstallApp, useUninstallApp } from "@/hooks/use-domain-mutations";
import { categoriesOf, filterApps, installedCount } from "@/lib/marketplace";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function MarketplacePage() {
  const marketplace = useMarketplace();
  const install = useInstallApp();
  const uninstall = useUninstallApp();

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [detail, setDetail] = React.useState<MarketplaceEntry | null>(null);

  const all = React.useMemo(() => marketplace.data ?? [], [marketplace.data]);
  const categories = React.useMemo(() => categoriesOf(all), [all]);
  const filtered = React.useMemo(
    () => filterApps(all, { q: query, category }),
    [all, query, category],
  );
  const installed = installedCount(all);

  // Keep the detail dialog in sync with fresh catalog data after install/uninstall.
  const detailLive = detail ? (all.find((a) => a.id === detail.id) ?? detail) : null;
  const pendingId =
    (install.isPending && (install.variables as string)) ||
    (uninstall.isPending && (uninstall.variables as string)) ||
    null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Apps"
        title="Marketplace"
        description={
          all.length > 0
            ? `${installed} ${installed === 1 ? "app instalada" : "apps instaladas"} de ${all.length} disponibles.`
            : "Amplía NV Core con apps instalables por workspace."
        }
      />

      <div className="flex flex-col gap-3">
        <Input
          placeholder="Buscar apps…"
          className="max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <CategoryChip label="Todas" active={category === ""} onClick={() => setCategory("")} />
            {categories.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                active={category === c}
                onClick={() => setCategory(category === c ? "" : c)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {marketplace.isLoading ? (
        <CardGridSkeleton count={9} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Catálogo no disponible"
          description="Conecta el backend para ver el catálogo de apps."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin resultados"
          description={`No encontramos apps para «${query || category}».`}
          compact
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              pending={pendingId === app.id}
              onOpen={() => setDetail(app)}
              onInstall={() => install.mutate(app.id)}
              onUninstall={() => uninstall.mutate(app.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!detailLive} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detailLive ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
                    style={{ background: `hsl(${detailLive.hue} 60% 45%)` }}
                  >
                    {detailLive.name.slice(0, 2)}
                  </div>
                  <div>
                    <DialogTitle>{detailLive.name}</DialogTitle>
                    <div className="text-[11px] uppercase tracking-wide text-ink-faint">
                      {detailLive.category}
                    </div>
                  </div>
                </div>
                <DialogDescription className="pt-2">{detailLive.description}</DialogDescription>
              </DialogHeader>

              <ul className="space-y-2">
                {detailLive.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
                {detailLive.installed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-state-success">
                    <Check className="size-4" /> Instalada
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">No instalada</span>
                )}
                {detailLive.installed ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pendingId === detailLive.id}
                    onClick={() => uninstall.mutate(detailLive.id)}
                  >
                    {pendingId === detailLive.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    Desinstalar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pendingId === detailLive.id}
                    onClick={() => install.mutate(detailLive.id)}
                  >
                    {pendingId === detailLive.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    Instalar
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
          : "rounded-full border border-line-soft bg-panel px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-bright hover:text-ink"
      }
    >
      {label}
    </button>
  );
}

function AppCard({
  app,
  pending,
  onOpen,
  onInstall,
  onUninstall,
}: {
  app: MarketplaceEntry;
  pending: boolean;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: `hsl(${app.hue} 60% 45%)` }}
          aria-label={`Ver detalles de ${app.name}`}
        >
          {app.name.slice(0, 2)}
        </button>
        {app.installed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-state-success/10 px-2 py-0.5 text-[11px] font-medium text-state-success">
            <Check className="size-3" /> Instalada
          </span>
        ) : null}
      </div>

      <button type="button" onClick={onOpen} className="text-left">
        <div className="text-sm font-semibold text-ink-bright group-hover:text-brand">
          {app.name}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">{app.category}</div>
      </button>

      <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">{app.tagline}</p>

      <div className="mt-auto pt-1">
        {app.installed ? (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={onUninstall}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Desinstalar
          </Button>
        ) : (
          <Button size="sm" className="w-full" disabled={pending} onClick={onInstall}>
            {pending ? <Loader2 className="animate-spin" /> : <Download />}
            Instalar
          </Button>
        )}
      </div>
    </div>
  );
}
