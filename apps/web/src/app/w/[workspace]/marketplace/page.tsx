import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Circle, Plug } from "lucide-react";
import type { Integration } from "@nv/domain";

import { useIntegrations } from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { categoriesOf, connectedCount, filterIntegrations } from "@/lib/integrations";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CredentialDialog } from "@/components/entities/credential-dialog";

export default function IntegrationsPage() {
  const integrations = useIntegrations();
  const ws = useWorkspace();
  const [credsFor, setCredsFor] = React.useState<Integration | null>(null);

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");

  const all = React.useMemo(() => integrations.data ?? [], [integrations.data]);
  const categories = React.useMemo(() => categoriesOf(all), [all]);
  const filtered = React.useMemo(
    () => filterIntegrations(all, query, category),
    [all, query, category],
  );
  const connected = connectedCount(all);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integraciones"
        title="Integraciones"
        description={
          all.length > 0
            ? `${connected} de ${all.length} conectadas. Enlaza tus herramientas y ve dónde configurarlas.`
            : "Conecta NV Marketing con las herramientas que ya usas."
        }
      />

      <div className="flex flex-col gap-3">
        <Input
          placeholder="Buscar integraciones…"
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

      {integrations.isLoading ? (
        <CardGridSkeleton count={9} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Catálogo no disponible"
          description="Conecta el backend para ver el estado de tus integraciones."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Sin resultados"
          description={`No encontramos integraciones para «${query || category}».`}
          compact
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <IntegrationCard
              key={it.id}
              integration={it}
              workspaceSlug={ws.slug}
              onConfigure={setCredsFor}
            />
          ))}
        </div>
      )}

      <CredentialDialog
        integration={credsFor}
        open={credsFor !== null}
        onOpenChange={(v) => {
          if (!v) setCredsFor(null);
        }}
      />
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
          ? "border-brand bg-brand/10 text-brand rounded-full border px-3 py-1 text-xs font-medium"
          : "border-line-soft bg-panel text-ink-muted hover:border-line-bright hover:text-ink rounded-full border px-3 py-1 text-xs font-medium transition-colors"
      }
    >
      {label}
    </button>
  );
}

function IntegrationCard({
  integration,
  workspaceSlug,
  onConfigure,
}: {
  integration: Integration;
  workspaceSlug: string;
  onConfigure: (integration: Integration) => void;
}) {
  const { name, category, description, hue, connected, module, setupHint, provider, fields } =
    integration;
  // Providers with in-app credential fields open a dialog to paste the key;
  // everything else deep-links to the module where it's configured.
  const inApp = Boolean(provider && fields && fields.length > 0);
  const href = !inApp && module ? `/w/${workspaceSlug}/${module}` : undefined;

  return (
    <div className="border-line-soft bg-panel hover:border-line-bright group flex flex-col gap-3 rounded-xl border p-4 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div
          className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: `hsl(${hue ?? 220} 60% 45%)` }}
          aria-hidden
        >
          {name.slice(0, 2)}
        </div>
        {connected ? (
          <span className="bg-state-success/10 text-state-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
            <CheckCircle2 className="size-3" /> Conectada
          </span>
        ) : (
          <span className="bg-line-strong/50 text-ink-faint inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
            <Circle className="size-3" /> Sin conectar
          </span>
        )}
      </div>

      <div>
        <div className="text-ink-bright text-sm font-semibold">{name}</div>
        <div className="text-ink-faint text-[11px] uppercase tracking-wide">{category}</div>
      </div>

      <p className="text-ink-muted text-xs leading-relaxed">{description}</p>
      {!connected && setupHint ? <p className="text-ink-faint text-[11px]">{setupHint}</p> : null}

      <div className="mt-auto pt-1">
        {inApp ? (
          <Button
            type="button"
            variant={connected ? "secondary" : "default"}
            size="sm"
            className="w-full"
            onClick={() => onConfigure(integration)}
          >
            {connected ? "Gestionar" : "Configurar"}
            <ArrowUpRight className="size-4" />
          </Button>
        ) : href ? (
          <Button
            asChild
            variant={connected ? "secondary" : "default"}
            size="sm"
            className="w-full"
          >
            <Link to={href}>
              {connected ? "Gestionar" : "Configurar"}
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
