import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CONTACT_STAGES, type Contact } from "@nv/domain";
import { Building2, Loader2, Mail, Pencil, Phone, Tag, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { STAGE_ACCENTS } from "@/lib/crm";
import { useContactNotes } from "@/hooks/use-domain-data";
import { useAddContactNote, useDeleteContactNote, useUpdateContact } from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

const selectClass = "h-8 rounded-lg border border-line-soft bg-panel-raised px-2 text-xs text-ink";

export function ContactDetailDrawer({
  contact,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (c: Contact) => void;
  onDelete: (c: Contact) => void;
}) {
  const notes = useContactNotes(open && contact ? contact.id : null);
  const addNote = useAddContactNote(contact?.id ?? "");
  const delNote = useDeleteContactNote(contact?.id ?? "");
  const updateContact = useUpdateContact();
  const [draft, setDraft] = React.useState("");

  function submitNote() {
    if (!draft.trim()) return;
    addNote.mutate(draft.trim(), { onSuccess: () => setDraft("") });
  }

  if (!contact) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fadein" />
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line-strong bg-panel shadow-panel focus:outline-none data-[state=open]:animate-in"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
              style={{ background: STAGE_ACCENTS[contact.stage] }}
            >
              {initials(contact.name)}
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-base font-semibold text-ink-bright">
                {contact.name}
              </DialogPrimitive.Title>
              {contact.company ? <p className="truncate text-xs text-ink-muted">{contact.company}</p> : null}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-ink-muted hover:text-ink" aria-label="Cerrar">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Stage + actions */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-faint">
                Etapa
                <select
                  value={contact.stage}
                  onChange={(e) => updateContact.mutate({ id: contact.id, input: { stage: e.target.value as Contact["stage"] } })}
                  className={selectClass}
                  aria-label="Etapa del contacto"
                >
                  {CONTACT_STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="ml-auto flex gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => onEdit(contact)}><Pencil className="size-3.5" /> Editar</Button>
                <Button variant="outline" size="sm" onClick={() => onDelete(contact)}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-2 rounded-xl border border-line-soft bg-panel-raised p-3 text-sm">
              <Field icon={Phone} label="Teléfono" value={contact.phone} />
              <Field icon={Mail} label="Email" value={contact.email} />
              <Field icon={Building2} label="Empresa" value={contact.company} />
              {contact.tags.length > 0 ? (
                <div className="flex items-start gap-2 pt-1">
                  <Tag className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                  <span className="flex flex-wrap gap-1">
                    {contact.tags.map((t) => (
                      <Badge key={t} variant="neutral">{t}</Badge>
                    ))}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Notes / activity */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Actividad</h3>
              <div className="space-y-1.5">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Añade una nota, resumen de llamada, próxima acción…"
                  rows={2}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitNote} disabled={addNote.isPending || !draft.trim()}>
                    {addNote.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null} Añadir nota
                  </Button>
                </div>
              </div>

              {notes.isLoading ? (
                <p className="py-3 text-center text-xs text-ink-faint">Cargando…</p>
              ) : (notes.data ?? []).length === 0 ? (
                <p className="py-3 text-center text-xs text-ink-faint">Sin actividad todavía.</p>
              ) : (
                <ul className="space-y-2">
                  {(notes.data ?? []).map((n) => (
                    <li key={n.id} className="group rounded-lg border border-line-soft bg-panel-raised p-2.5">
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-faint">
                        <span className="font-medium text-ink-muted">{n.author}</span>
                        <span>· {relative(n.createdAt)}</span>
                        <button
                          onClick={() => delNote.mutate(n.id)}
                          className="ml-auto text-ink-faint opacity-0 transition-opacity hover:text-state-danger group-hover:opacity-100"
                          aria-label="Eliminar nota"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-ink-faint" />
      <span className="w-16 shrink-0 text-xs text-ink-faint">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate", value ? "text-ink" : "text-ink-faint")}>{value || "—"}</span>
    </div>
  );
}
