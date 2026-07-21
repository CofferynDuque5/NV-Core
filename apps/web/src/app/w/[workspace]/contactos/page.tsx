"use client";

import * as React from "react";
import { Contact, Download, Filter, Loader2, Plus, Send, Trash2, Upload } from "lucide-react";

import { useContacts } from "@/hooks/use-domain-data";
import { useDeleteContact } from "@/hooks/use-domain-mutations";
import { useUiStore } from "@/stores/ui-store";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { TableSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContactCreateDialog } from "@/components/entities/contact-create-dialog";

const COLUMNS = ["Contacto", "Teléfono", "Empresa", "Etiquetas", "Estado", "Último", ""];

export default function ContactosPage() {
  const contacts = useContacts();
  const openCompose = useUiStore((s) => s.openCompose);
  const [createOpen, setCreateOpen] = React.useState(false);
  const del = useDeleteContact();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  function remove(id: string) {
    setDeletingId(id);
    del.mutate(id, { onSettled: () => setDeletingId(null) });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audiencia · CRM"
        title="Contactos"
        description="Tu base de clientes y prospectos."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={openCompose}>
              <Send className="size-4" /> Mensaje masivo
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Nuevo
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar contactos…" className="h-9 max-w-xs" />
        <Button variant="outline" size="sm">
          <Filter className="size-4" /> Filtrar
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm">
            <Upload className="size-4" /> Importar
          </Button>
          <Button variant="ghost" size="sm">
            <Download className="size-4" /> Exportar
          </Button>
        </div>
      </div>

      <QueryBoundary
        query={contacts}
        skeleton={<TableSkeleton rows={7} cols={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Contact,
          title: "Tu CRM está vacío",
          description:
            "Importa contactos o crea el primero manualmente para empezar a segmentar y hacer difusión.",
          action: (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Nuevo contacto
            </Button>
          ),
        }}
      >
        {(data) => (
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
                {data.items.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-panel-raised/40">
                    <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.phone}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.company}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {row.tags.map((t) => (
                          <Badge key={t} variant="neutral">
                            {t}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{row.stage}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.lastContactAt}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(row.id)}
                        disabled={deletingId === row.id}
                        className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                        title="Eliminar"
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </QueryBoundary>

      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
