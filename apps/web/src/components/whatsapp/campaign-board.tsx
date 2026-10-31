import * as React from "react";
import type { Campaign, CampaignStatus } from "@nv/domain";
import { Copy, FolderPlus, Loader2, Pause, Pencil, Play, Search, Send, Tag, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { scheduleLabel } from "@/lib/schedule";
import {
  CAMPAIGN_STATUS_SHORT,
  CAMPAIGN_TABS,
  NO_CATEGORY,
  campaignCategories,
  campaignTab,
  filterCampaigns,
  type CampaignTab,
} from "@/lib/campaigns";
import { useUpdateCampaign } from "@/hooks/use-domain-mutations";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelStack } from "@/components/common/channel-badge";
import { EmptyState } from "@/components/common/empty-state";

const STATUS_VARIANT: Record<CampaignStatus, "default" | "success" | "warning" | "neutral"> = {
  activa: "success",
  programada: "warning",
  pausada: "neutral",
  borrador: "neutral",
  completada: "default",
};

const TAB_EMPTY: Record<CampaignTab, string> = {
  marcha: "No hay campañas programadas ni enviándose ahora.",
  borradores: "No tienes borradores. Guarda una campaña como «Borrador» para dejarla lista sin enviarla.",
  pausadas: "No hay campañas pausadas.",
  terminadas: "Aún no ha terminado ninguna campaña.",
};

/**
 * Campaigns split into tabs (en marcha, borradores, pausadas, terminadas),
 * narrowed by the team's own categories and a search, shown as a calm list
 * instead of a wall of cards.
 */
export function CampaignBoard({
  items,
  tab,
  onTab,
  category,
  onCategory,
  query,
  onQuery,
  renderRow,
}: {
  items: Campaign[];
  /** null → the first tab that has campaigns. */
  tab: CampaignTab | null;
  onTab: (t: CampaignTab) => void;
  category: string | null;
  onCategory: (c: string | null) => void;
  query: string;
  onQuery: (q: string) => void;
  renderRow: (c: Campaign) => React.ReactNode;
}) {
  const counts = React.useMemo(() => {
    const out: Record<CampaignTab, number> = { marcha: 0, borradores: 0, pausadas: 0, terminadas: 0 };
    for (const c of items) out[campaignTab(c)] += 1;
    return out;
  }, [items]);
  const current: CampaignTab = tab ?? CAMPAIGN_TABS.find((t) => counts[t.id] > 0)?.id ?? "marcha";
  const inTab = items.filter((c) => campaignTab(c) === current);
  const categories = campaignCategories(inTab);
  const hasUncategorized = inTab.some((c) => !c.category?.trim());
  const visible = filterCampaigns(items, { tab: current, category, query });

  // Group by category when showing every category, so each block stays short.
  const groups = React.useMemo(() => {
    if (category !== null) return [{ name: category, items: visible }];
    const map = new Map<string, Campaign[]>();
    for (const c of visible) {
      const key = c.category?.trim() || NO_CATEGORY;
      const found = [...map.keys()].find((k) => k.toLowerCase() === key.toLowerCase()) ?? key;
      map.set(found, [...(map.get(found) ?? []), c]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, "es")))
      .map(([name, list]) => ({ name, items: list }));
  }, [visible, category]);

  const allCategories = React.useMemo(() => campaignCategories(items), [items]);

  return (
    <CategoriesContext.Provider value={allCategories}>
    <div className="space-y-4">
      <div role="tablist" aria-label="Estado de las campañas" className="flex flex-wrap gap-1 border-b border-line">
        {CAMPAIGN_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current === t.id}
            data-testid={`campaign-tab-${t.id}`}
            onClick={() => {
              onTab(t.id);
              onCategory(null);
            }}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
              current === t.id
                ? "border-brand font-semibold text-ink-bright"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px]",
                current === t.id ? "bg-brand/15 text-brand" : "bg-panel-raised text-ink-faint",
              )}
            >
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar campaña…"
            aria-label="Buscar campaña"
            className="h-9 pl-8"
          />
        </div>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="campaign-categories">
            <CategoryChip active={category === null} onClick={() => onCategory(null)}>
              Todas
            </CategoryChip>
            {categories.map((c) => (
              <CategoryChip
                key={c}
                active={category?.toLowerCase() === c.toLowerCase()}
                onClick={() => onCategory(c)}
              >
                {c}
              </CategoryChip>
            ))}
            {hasUncategorized ? (
              <CategoryChip active={category === NO_CATEGORY} onClick={() => onCategory(NO_CATEGORY)}>
                Sin categoría
              </CategoryChip>
            ) : null}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={query ? "Ninguna campaña coincide" : "Nada por aquí"}
          description={query ? "Prueba con otro nombre." : TAB_EMPTY[current]}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.name || "__none"} className="space-y-2">
              {category === null && (groups.length > 1 || g.name !== NO_CATEGORY) ? (
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <Tag className="size-3.5" />
                  {g.name || "Sin categoría"}
                  <span className="font-normal normal-case">({g.items.length})</span>
                </h3>
              ) : null}
              <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-panel">
                {g.items.map((c) => renderRow(c))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
    </CategoriesContext.Provider>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-brand/40 bg-brand/15 text-brand"
          : "border-line-soft bg-panel-raised text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const iconButton = "rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-high hover:text-ink";

/** One campaign in the list: name, category, when it sends, channels and actions. */
export function CampaignRow({
  campaign: c,
  running,
  duplicating,
  deleting,
  onRun,
  onPause,
  onResume,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  campaign: Campaign;
  running: boolean;
  duplicating: boolean;
  deleting: boolean;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const sending = c.status === "activa" && c.progress > 0 && c.progress < 100;
  return (
    <div data-testid="campaign-row" className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink-bright">{c.name}</h3>
          <Badge variant={STATUS_VARIANT[c.status]}>{CAMPAIGN_STATUS_SHORT[c.status]}</Badge>
          <CategoryMenu campaign={c} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          <span>{scheduleLabel(c)}</span>
          {c.lastRunAt ? <span>Último envío {new Date(c.lastRunAt).toLocaleString("es")}</span> : null}
        </div>
        {sending ? (
          <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-violet"
              style={{ width: `${c.progress}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {c.channels.length > 0 ? <ChannelStack ids={c.channels} /> : null}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onRun}
            disabled={running}
            className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-success/10 hover:text-state-success"
            title="Enviar ahora"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
          {c.status === "pausada" ? (
            <button onClick={onResume} className={iconButton} title="Reanudar">
              <Play className="size-4" />
            </button>
          ) : c.status !== "borrador" && c.status !== "completada" ? (
            <button onClick={onPause} className={iconButton} title="Pausar">
              <Pause className="size-4" />
            </button>
          ) : null}
          <button onClick={onEdit} className={iconButton} title="Editar">
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDuplicate}
            disabled={duplicating}
            className={iconButton}
            title="Duplicar"
            aria-label={`Duplicar ${c.name}`}
          >
            {duplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
            title="Eliminar"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The campaign's category, as a chip that moves it to another one. */
function CategoryMenu({ campaign: c }: { campaign: Campaign }) {
  const update = useUpdateCampaign();
  const all = useCampaignCategories();
  const move = (category: string | null) => update.mutate({ id: c.id, input: { category } });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="campaign-category-chip"
          title="Cambiar categoría"
          className="flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] text-ink-muted hover:text-ink"
        >
          <Tag className="size-3" />
          {c.category?.trim() || "Sin categoría"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Mover a</DropdownMenuLabel>
        {all.map((name) => (
          <DropdownMenuItem key={name} onSelect={() => move(name)}>
            {name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => move(null)}>Sin categoría</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            const name = window.prompt("Nombre de la nueva categoría", "")?.trim();
            if (name) move(name.slice(0, 40));
          }}
        >
          <FolderPlus className="size-4" /> Nueva categoría…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Every category in use in this brand (for the «Mover a» menu). */
const CategoriesContext = React.createContext<string[]>([]);

function useCampaignCategories(): string[] {
  return React.useContext(CategoriesContext);
}
