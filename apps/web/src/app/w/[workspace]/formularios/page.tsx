
import * as React from "react";
import { toast } from "sonner";
import { ClipboardList, Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import type { Form } from "@nv/domain";

import { useForms } from "@/hooks/use-domain-data";
import { useDeleteForm } from "@/hooks/use-domain-mutations";
import { conversionRate, embedSnippet, publicFormUrl } from "@/lib/forms";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { FormFormDialog } from "@/components/entities/form-form-dialog";

export default function FormulariosPage() {
  const forms = useForms();
  const del = useDeleteForm();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Form | undefined>(undefined);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Captura de leads"
        title="Formularios"
        description="Formularios opt-in públicos que convierten visitas en contactos."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Nuevo formulario
          </Button>
        }
      />

      <QueryBoundary
        query={forms}
        skeleton={<CardGridSkeleton count={3} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: ClipboardList,
          title: "Sin formularios",
          description:
            "Crea un formulario opt-in, compártelo o inscrústalo en tu web, y cada envío se guarda como contacto.",
          action: (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nuevo formulario
            </Button>
          ),
        }}
      >
        {(d) => (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.items.map((f) => {
              const url = publicFormUrl(origin, f.id);
              return (
                <div
                  key={f.id}
                  className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-bright">{f.name}</span>
                    <span className="whitespace-nowrap rounded-md bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted">
                      {conversionRate(f)}% conv.
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="Vistas" value={f.views} />
                    <Stat label="Envíos" value={f.submissions} />
                    <Stat label="Campos" value={f.fields.length} />
                  </div>

                  {f.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {f.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-panel-raised px-2 py-0.5 text-[11px] text-ink-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => copy(url, "Enlace")}>
                      <Copy className="size-3.5" /> Enlace
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copy(embedSnippet(origin, f.id), "Embed")}
                    >
                      <Copy className="size-3.5" /> Embed
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={url} target="_blank" rel="noreferrer" aria-label="Abrir formulario">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(f);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`¿Eliminar el formulario "${f.name}"?`)) del.mutate(f.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </QueryBoundary>

      <FormFormDialog open={open} onOpenChange={setOpen} form={editing} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-panel-raised px-2 py-1.5">
      <div className="text-sm font-semibold text-ink-bright">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
