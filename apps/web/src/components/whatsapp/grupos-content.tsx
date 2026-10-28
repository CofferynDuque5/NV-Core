
import * as React from "react";
import { categoryLabel, type Group, type GroupRulesCheck } from "@nv/domain";
import { Ban, Loader2, Plus, RotateCcw, Send, Settings2, ShieldCheck, SlidersHorizontal, Trash2, Users } from "lucide-react";

import { useGroups } from "@/hooks/use-domain-data";
import { useCheckGroupRules, useClearSyncedGroups, useExcludeGroups } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { countryLine, filterGroups, groupCategories, groupStatus, requirementLabels, type GroupPostingStatus } from "@/lib/groups";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { TableSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GroupCreateDialog } from "@/components/entities/group-create-dialog";
import { GroupVarsDialog } from "@/components/entities/group-vars-dialog";
import { GroupRulesDialog } from "@/components/entities/group-rules-dialog";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";

const COLUMNS = ["", "Grupo", "País", "Reglas", "Miembros", "Estado", ""];

type StatusFilter = "" | GroupPostingStatus | "requisitos";
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "apto", label: "Aptos" },
  { id: "requisitos", label: "Con requisitos" },
  { id: "no-apto", label: "No aptos" },
  { id: "apartado", label: "Apartados" },
];

/** Status filter for the groups table. */
export function matchesStatus(g: Group, filter: StatusFilter): boolean {
  if (!filter) return true;
  if (filter === "requisitos") return !g.excluded && !!(g.requiresPrice || g.requiresImage);
  return groupStatus(g).status === filter;
}

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-2.5 py-1 text-xs transition-colors",
    active ? "border-brand/60 bg-brand/10 text-ink" : "border-line-soft text-ink-muted hover:border-line-bright",
  );

function StatusBadge({ g }: { g: Group }) {
  const { status, reasons } = groupStatus(g);
  if (status === "apartado") return <Badge variant="neutral">Apartado</Badge>;
  if (status === "no-apto")
    return (
      <span title={reasons.join(" ")}>
        <Badge variant="danger">No apto</Badge>
        <span className="mt-0.5 block max-w-[180px] truncate text-[11px] text-ink-faint">{reasons[0]}</span>
      </span>
    );
  return <Badge variant="success">Apto</Badge>;
}

function RulesSummary({ results, onClose }: { results: GroupRulesCheck[] | null; onClose: () => void }) {
  const ok = results?.filter((r) => r.canPost) ?? [];
  const bad = results?.filter((r) => !r.canPost) ?? [];
  const withReq = ok.filter((r) => r.group.requiresPrice || r.group.requiresImage);
  return (
    <Dialog open={results !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revisión de reglas</DialogTitle>
          <DialogDescription>
            {results?.[0]?.source === "whatsapp"
              ? "Leímos ahora la descripción y los permisos de cada grupo en WhatsApp."
              : "WhatsApp no está conectado: revisamos con las reglas guardadas."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="rules-summary">
          <div className="rounded-lg border border-line-soft p-3">
            <p className="text-2xl font-semibold text-state-success">{ok.length}</p>
            <p className="text-xs text-ink-muted">puedes publicar</p>
          </div>
          <div className="rounded-lg border border-line-soft p-3">
            <p className="text-2xl font-semibold text-state-warning">{withReq.length}</p>
            <p className="text-xs text-ink-muted">piden precio o foto</p>
          </div>
          <div className="rounded-lg border border-line-soft p-3">
            <p className="text-2xl font-semibold text-state-danger">{bad.length}</p>
            <p className="text-xs text-ink-muted">no aptos o apartados</p>
          </div>
        </div>
        {bad.length + withReq.length > 0 ? (
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {[...bad, ...withReq].map((r) => (
              <li key={r.group.id} className="rounded-lg border border-line-soft p-2.5">
                <p className="font-medium text-ink">{r.group.name}</p>
                <ul className="text-xs text-ink-muted">
                  {r.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function GruposContent({ showHeader = true }: { showHeader?: boolean }) {
  const groups = useGroups();
  const clearSynced = useClearSyncedGroups();
  const checkRules = useCheckGroupRules();
  const exclude = useExcludeGroups();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [varsGroup, setVarsGroup] = React.useState<Group | null>(null);
  const [rulesGroup, setRulesGroup] = React.useState<Group | null>(null);
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<GroupRulesCheck[] | null>(null);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const allItems = groups.data?.items ?? [];
  const cats = groupCategories(allItems);
  const syncedCount = allItems.filter((g) => g.synced).length;

  async function onClearSynced() {
    const ok = await confirm({
      title: "Borrar grupos importados",
      description:
        `Se eliminarán los ${syncedCount} grupos importados automáticamente de WhatsApp/Telegram ` +
        `(los que no agregaste a mano). Los grupos creados manualmente se conservan. ` +
        `Podrás volver a importarlos con "Sincronizar" en Conexiones.`,
      confirmLabel: "Borrar importados",
      destructive: true,
    });
    if (ok) clearSynced.mutate(undefined);
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = (excluded: boolean) =>
    exclude.mutate({ ids: [...selected], excluded }, { onSuccess: () => setSelected(new Set()) });

  const actions = (
    <>
      {syncedCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSynced}
          disabled={clearSynced.isPending}
          className="text-state-danger hover:bg-state-danger/10"
        >
          <Trash2 className="size-4" /> Borrar importados ({syncedCount})
        </Button>
      ) : null}
      {allItems.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => checkRules.mutate(undefined, { onSuccess: (r) => setSummary(r) })}
          disabled={checkRules.isPending}
        >
          {checkRules.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Revisar reglas
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" onClick={() => setCampaignOpen(true)}>
        <Send className="size-4" /> Enviar a grupos
      </Button>
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" /> Nuevo grupo
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow="WhatsApp · Audiencia"
          title="Grupos"
          description="Revisa las reglas de cada grupo, aparta los que nunca usarás y define su país para poner el precio en su moneda."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}

      <QueryBoundary
        query={groups}
        skeleton={<TableSkeleton rows={6} cols={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Users,
          title: "Sin grupos todavía",
          description:
            "Conecta WhatsApp y sincroniza tus grupos, o crea uno para difundir mensajes a tu audiencia.",
          action: (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Nuevo grupo
            </Button>
          ),
        }}
      >
        {(data) => {
          const filtered = filterGroups(data.items, { q, category }).filter((g) => matchesStatus(g, status));
          const allSelected = filtered.length > 0 && filtered.every((g) => selected.has(g.id));
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar grupo…"
                  className="h-9 w-full max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Estado">
                  {STATUS_FILTERS.map((f) => (
                    <button key={f.id || "all"} type="button" onClick={() => setStatus(f.id)} className={chip(status === f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-xs text-ink-faint">
                  {filtered.length} de {data.items.length}
                </span>
              </div>
              {cats.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink-faint">Etiquetas:</span>
                  <button type="button" onClick={() => setCategory("")} className={chip(category === "")}>
                    Todas
                  </button>
                  {cats.map((c) => (
                    <button key={c} type="button" onClick={() => setCategory(c)} className={chip(category === c)}>
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}

              {selected.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
                  <span className="text-ink">{selected.size} seleccionados</span>
                  <Button size="sm" variant="secondary" onClick={() => bulk(true)} disabled={exclude.isPending}>
                    <Ban className="size-4" /> Apartar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => bulk(false)} disabled={exclude.isPending}>
                    <RotateCcw className="size-4" /> Volver a incluir
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                    Quitar selección
                  </Button>
                </div>
              ) : null}

              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-faint">
                      {COLUMNS.map((c, i) => (
                        <th key={i} className={cn("px-4 py-3 font-medium", i === 0 && "w-8 pr-0")}>
                          {i === 0 ? (
                            <input
                              type="checkbox"
                              aria-label="Seleccionar todos"
                              className="size-4 accent-[#5F86F2]"
                              checked={allSelected}
                              onChange={() =>
                                setSelected(allSelected ? new Set() : new Set(filtered.map((g) => g.id)))
                              }
                            />
                          ) : (
                            c
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-ink-faint">
                          Sin grupos que coincidan con el filtro.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((g) => {
                        const country = countryLine(g);
                        const reqs = requirementLabels(g);
                        const type = categoryLabel(g.category);
                        return (
                          <tr
                            key={g.id}
                            data-testid="group-row"
                            className={cn(
                              "border-b border-line last:border-0 hover:bg-panel-raised/40",
                              g.excluded && "opacity-60",
                            )}
                          >
                            <td className="w-8 py-3 pl-4 pr-0">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${g.name}`}
                                className="size-4 accent-[#5F86F2]"
                                checked={selected.has(g.id)}
                                onChange={() => toggle(g.id)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-ink">{g.name}</div>
                              <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink-faint">
                                {type ? <span>{type}</span> : null}
                                {(g.tags ?? []).map((t) => (
                                  <Badge key={t} variant="neutral">
                                    {t}
                                  </Badge>
                                ))}
                                {g.synced ? <span>· WhatsApp</span> : <span>· Manual</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {country ? (
                                <span className="text-ink-muted">{country}</span>
                              ) : (
                                <span className="text-state-warning">Sin país</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex max-w-[220px] flex-wrap gap-1">
                                {reqs.length > 0 ? (
                                  reqs.map((r) => (
                                    <Badge key={r} variant={r === "Prohíbe publicidad" || r === "Solo admins" ? "danger" : "warning"}>
                                      {r}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-ink-faint">
                                    {g.rulesCheckedAt ? "Sin requisitos" : "Sin revisar"}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-ink-muted">{g.members}</td>
                            <td className="px-4 py-3">
                              <StatusBadge g={g} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setRulesGroup(g)}
                                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                                  title="Reglas, país y tipo"
                                >
                                  <SlidersHorizontal className="size-4" /> Configurar
                                </button>
                                <button
                                  onClick={() => setVarsGroup(g)}
                                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                                  title="Variables"
                                >
                                  <Settings2 className="size-4" /> Variables
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </Panel>
            </div>
          );
        }}
      </QueryBoundary>

      <GroupCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <GroupVarsDialog
        open={varsGroup !== null}
        onOpenChange={(v) => {
          if (!v) setVarsGroup(null);
        }}
        group={varsGroup}
      />
      <GroupRulesDialog group={rulesGroup} onOpenChange={(v) => !v && setRulesGroup(null)} />
      <RulesSummary results={summary} onClose={() => setSummary(null)} />
      <CampaignFormDialog open={campaignOpen} onOpenChange={setCampaignOpen} campaign={null} />
    </div>
  );
}
