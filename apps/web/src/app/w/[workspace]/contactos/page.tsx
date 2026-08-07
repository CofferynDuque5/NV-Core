import * as React from "react";
import { CONTACT_STAGES, type Contact as ContactEntity, type ContactStage } from "@nv/domain";
import { Columns3, Contact, Loader2, Pencil, Plus, Search, Send, Table2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { STAGE_ACCENTS } from "@/lib/crm";
import { useContacts } from "@/hooks/use-domain-data";
import { useDeleteContact, useMoveContactStage } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { useUiStore } from "@/stores/ui-store";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { TableSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContactFormDialog } from "@/components/entities/contact-form-dialog";
import { CrmBoard } from "@/components/crm/crm-board";
import { ContactDetailDrawer } from "@/components/crm/contact-detail-drawer";

const COLUMNS = ["Contacto", "Teléfono", "Empresa", "Etiquetas", "Etapa", ""];

function StageBadge({ stage }: { stage: ContactStage }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
      style={{ background: `${STAGE_ACCENTS[stage]}22`, color: STAGE_ACCENTS[stage] }}
    >
      <span className="size-1.5 rounded-full" style={{ background: STAGE_ACCENTS[stage] }} />
      {stage}
    </span>
  );
}

export default function ContactosPage() {
  const openCompose = useUiStore((s) => s.openCompose);
  const del = useDeleteContact();
  const move = useMoveContactStage();
  const confirm = useConfirm();

  const PAGE_SIZE = 100;
  const [view, setView] = React.useState<"table" | "board">("board");
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [stage, setStage] = React.useState<ContactStage | "">("");
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContactEntity | null>(null);
  const [drawer, setDrawer] = React.useState<ContactEntity | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Debounce the search so we query the server once the user pauses typing.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  // Any filter change returns to the first page.
  React.useEffect(() => setPage(1), [debouncedQ, stage]);

  // Search + stage filtering run on the SERVER — authoritative across the whole
  // workspace, not just the loaded page (the old client filter over 100 rows
  // silently missed matches beyond it).
  const contacts = useContacts({ q: debouncedQ, stage: stage || undefined, page, pageSize: PAGE_SIZE });
  const items = React.useMemo(() => contacts.data?.items ?? [], [contacts.data]);
  const total = contacts.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(debouncedQ || stage);

  // Keep the drawer's contact in sync with fresh data after mutations.
  const drawerContact = drawer ? (items.find((c) => c.id === drawer.id) ?? drawer) : null;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: ContactEntity) {
    setEditing(row);
    setDialogOpen(true);
  }
  async function remove(row: ContactEntity) {
    const ok = await confirm({
      title: "Eliminar contacto",
      description: `¿Eliminar a ${row.name}? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(row.id);
    del.mutate(row.id, {
      onSettled: () => setDeletingId(null),
      onSuccess: () => setDrawer((d) => (d?.id === row.id ? null : d)),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audiencia · CRM"
        title="Contactos"
        description="Tu pipeline de clientes y prospectos, con actividad y etapas."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={openCompose}>
              <Send className="size-4" /> Mensaje masivo
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nuevo
            </Button>
          </>
        }
      />

      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, empresa, email…" className="pl-9" aria-label="Buscar contactos" />
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as ContactStage | "")}
          className="h-9 rounded-lg border border-line-soft bg-panel px-2 text-sm text-ink"
          aria-label="Filtrar por etapa"
        >
          <option value="">Todas las etapas</option>
          {CONTACT_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="ml-auto inline-flex rounded-lg border border-line-soft bg-panel p-0.5" role="tablist" aria-label="Vista">
          <button
            role="tab"
            aria-selected={view === "board"}
            onClick={() => setView("board")}
            className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", view === "board" ? "bg-brand/15 text-ink-bright" : "text-ink-muted hover:text-ink")}
          >
            <Columns3 className="size-4" /> Pipeline
          </button>
          <button
            role="tab"
            aria-selected={view === "table"}
            onClick={() => setView("table")}
            className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", view === "table" ? "bg-brand/15 text-ink-bright" : "text-ink-muted hover:text-ink")}
          >
            <Table2 className="size-4" /> Tabla
          </button>
        </div>
      </div>

      <QueryBoundary
        query={contacts}
        skeleton={<TableSkeleton rows={7} cols={6} />}
        isEmpty={(d) => d.items.length === 0 && !hasFilters}
        empty={{
          icon: Contact,
          title: "Tu CRM está vacío",
          description: "Crea el primer contacto para empezar a segmentar, hacer difusión y gestionar tu pipeline.",
          action: (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nuevo contacto
            </Button>
          ),
        }}
      >
        {() =>
          items.length === 0 ? (
            <Panel className="p-10 text-center text-sm text-ink-faint">Ningún contacto coincide con los filtros.</Panel>
          ) : view === "board" ? (
            <div className="space-y-3">
              <CrmBoard contacts={items} onOpen={setDrawer} onMove={(id, s) => move.mutate({ id, stage: s })} />
              {total > items.length ? (
                <p className="text-xs text-ink-faint">
                  Mostrando {items.length} de {total} contactos. Afina la búsqueda o el filtro de
                  etapa, o usa la vista <strong>Tabla</strong> para paginar.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
            <Panel className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-faint">
                    {COLUMNS.map((c, i) => (
                      <th key={i} className="px-4 py-3 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setDrawer(row)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised/40"
                    >
                      <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                      <td className="px-4 py-3 text-ink-muted">{row.phone}</td>
                      <td className="px-4 py-3 text-ink-muted">{row.company}</td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          {row.tags.map((t) => (
                            <Badge key={t} variant="neutral">{t}</Badge>
                          ))}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StageBadge stage={row.stage} /></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(row)} className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-high hover:text-ink" title="Editar">
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => remove(row)}
                            disabled={deletingId === row.id}
                            className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                            title="Eliminar"
                          >
                            {deletingId === row.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
              <span>
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span>Página {page} / {totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </div>
            </div>
          )
        }
      </QueryBoundary>

      <ContactFormDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editing} />
      <ContactDetailDrawer
        contact={drawerContact}
        open={drawer !== null}
        onOpenChange={(v) => { if (!v) setDrawer(null); }}
        onEdit={(c) => { setDrawer(null); openEdit(c); }}
        onDelete={(c) => remove(c)}
      />
    </div>
  );
}
