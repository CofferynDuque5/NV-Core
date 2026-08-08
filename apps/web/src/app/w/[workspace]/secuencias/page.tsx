
import * as React from "react";
import { Pencil, Plus, Send, Trash2, UserPlus } from "lucide-react";
import type { Sequence } from "@nv/domain";

import { useSequences } from "@/hooks/use-domain-data";
import { useDeleteSequence, useEnrollSequence } from "@/hooks/use-domain-mutations";
import { CHANNEL_LABEL, totalDays } from "@/lib/sequences";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { SequenceFormDialog } from "@/components/entities/sequence-form-dialog";

export default function SecuenciasPage() {
  const sequences = useSequences();
  const del = useDeleteSequence();
  const enroll = useEnrollSequence();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Sequence | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  function enrollByTag(s: Sequence) {
    const tag = prompt(`Inscribir en "${s.name}" a los contactos con la etiqueta:`);
    if (tag && tag.trim()) enroll.mutate({ id: s.id, input: { tag: tag.trim() } });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Autoresponders"
        title="Secuencias"
        description="Series automáticas por pasos (día 0, día 2…) disparadas por etiqueta."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Nueva secuencia
          </Button>
        }
      />

      <QueryBoundary
        query={sequences}
        skeleton={<CardGridSkeleton count={3} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Send,
          title: "Sin secuencias",
          description:
            "Crea una secuencia de mensajes automáticos e inscribe contactos por etiqueta.",
          action: (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nueva secuencia
            </Button>
          ),
        }}
      >
        {(d) => (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.items.map((s) => (
              <div
                key={s.id}
                className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-bright">{s.name}</span>
                  <span
                    className={
                      s.status === "active"
                        ? "rounded-full bg-state-success/15 px-2 py-0.5 text-[11px] font-medium text-state-success"
                        : "rounded-full bg-line-strong/60 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                    }
                  >
                    {s.status === "active" ? "Activa" : "Pausada"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {s.steps.map((st, i) => (
                    <React.Fragment key={st.id}>
                      {i > 0 ? <span className="text-ink-faint">→</span> : null}
                      <span className="rounded-md bg-panel-raised px-1.5 py-0.5 text-ink-muted">
                        {CHANNEL_LABEL[st.channel]}
                      </span>
                    </React.Fragment>
                  ))}
                  {s.steps.length === 0 ? <span className="text-ink-faint">Sin pasos</span> : null}
                </div>

                <div className="text-[11px] text-ink-faint">
                  {s.steps.length} paso(s) · {totalDays(s.steps)} días · {s.enrolled} inscrito(s)
                </div>

                <div className="mt-auto flex items-center gap-1 pt-1">
                  <Button variant="secondary" size="sm" onClick={() => enrollByTag(s)} disabled={enroll.isPending}>
                    <UserPlus className="size-3.5" /> Inscribir
                  </Button>
                  <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(s);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`¿Eliminar la secuencia "${s.name}"?`)) del.mutate(s.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>

      <SequenceFormDialog open={open} onOpenChange={setOpen} sequence={editing} />
    </div>
  );
}
