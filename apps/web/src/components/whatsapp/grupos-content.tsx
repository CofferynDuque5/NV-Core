
import * as React from "react";
import type { Group } from "@nv/domain";
import { Plus, Send, Settings2, Tag, Users } from "lucide-react";

import { useGroups } from "@/hooks/use-domain-data";
import { useUpdateGroup } from "@/hooks/use-domain-mutations";
import { filterGroups, groupCategories } from "@/lib/groups";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { TableSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupCreateDialog } from "@/components/entities/group-create-dialog";
import { GroupVarsDialog } from "@/components/entities/group-vars-dialog";
import { CampaignFormDialog } from "@/components/entities/campaign-form-dialog";

const COLUMNS = ["Grupo", "Categorías", "Miembros", "Estado", ""];

export function GruposContent({ showHeader = true }: { showHeader?: boolean }) {
  const groups = useGroups();
  const updateGroup = useUpdateGroup();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [varsGroup, setVarsGroup] = React.useState<Group | null>(null);
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");

  const allItems = groups.data?.items ?? [];
  const cats = groupCategories(allItems);

  function editCategories(g: Group) {
    const current = (g.tags ?? []).join(", ");
    const next = prompt(
      `Categorías de "${g.name}" (separadas por coma). Ej: universidad, trabajo`,
      current,
    );
    if (next === null) return;
    const tags = next
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    updateGroup.mutate({ id: g.id, input: { tags } });
  }

  const actions = (
    <>
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
          description="Gestiona tus grupos de difusión."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}

      <QueryBoundary
        query={groups}
        skeleton={<TableSkeleton rows={6} cols={5} />}
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
          const filtered = filterGroups(data.items, { q, category });
          return (
            <div className="space-y-3">
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar grupo…"
                  className="h-9 w-full max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategory("")}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      category === ""
                        ? "border-brand/60 bg-brand/10 text-ink"
                        : "border-line-soft text-ink-muted hover:border-line-bright",
                    )}
                  >
                    Todas
                  </button>
                  {cats.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        category === c
                          ? "border-brand/60 bg-brand/10 text-ink"
                          : "border-line-soft text-ink-muted hover:border-line-bright",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-xs text-ink-faint">
                  {filtered.length} de {data.items.length}
                </span>
              </div>

              <Panel className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-faint">
                      {COLUMNS.map((c, i) => (
                        <th key={i} className="px-4 py-3 font-medium">
                          {c}
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
                      filtered.map((g) => (
                        <tr
                          key={g.id}
                          className="border-b border-line last:border-0 hover:bg-panel-raised/40"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">{g.name}</div>
                            {g.remoteJid ? (
                              <div className="truncate text-[11px] text-ink-faint">{g.remoteJid}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {(g.tags ?? []).length > 0 ? (
                                (g.tags ?? []).map((t) => (
                                  <Badge key={t} variant="neutral">
                                    {t}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-[11px] text-ink-faint">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-muted">{g.members}</td>
                          <td className="px-4 py-3">
                            {g.synced ? (
                              <Badge variant="success">Sincronizado</Badge>
                            ) : (
                              <Badge variant="neutral">Manual</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => editCategories(g)}
                                disabled={updateGroup.isPending}
                                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink disabled:opacity-60"
                                title="Editar categorías"
                              >
                                <Tag className="size-4" /> Categorías
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
                      ))
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
      <CampaignFormDialog open={campaignOpen} onOpenChange={setCampaignOpen} campaign={null} />
    </div>
  );
}
