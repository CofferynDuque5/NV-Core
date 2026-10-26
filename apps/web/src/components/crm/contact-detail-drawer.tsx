import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CONTACT_STAGES, type Contact } from "@nv/domain";
import { BellOff, BellRing, Building2, KanbanSquare, Loader2, Mail, Navigation, Pencil, Phone, Plus, Tag, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { STAGE_ACCENTS } from "@/lib/crm";
import { attributionLine } from "@/lib/attribution";
import { useContactNotes, useTasks, useTeam } from "@/hooks/use-domain-data";
import {
  useAddContactNote,
  useDeleteContactNote,
  useSetContactOptOut,
  useUpdateContact,
} from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { PRIORITY_LABEL, TASK_COLUMNS, dueLabel, isOverdue } from "@/lib/tasks";

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
  const setOptOut = useSetContactOptOut();
  const [draft, setDraft] = React.useState("");
  const [taskOpen, setTaskOpen] = React.useState(false);
  const tasks = useTasks();
  const team = useTeam();
  const contactTasks = (tasks.data ?? [])
    .filter((t) => contact && t.contactId === contact.id)
    .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || a.position - b.position);

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

            {/* Opt-out / consent */}
            {contact.optOutAt ? (
              <div className="flex items-start gap-2 rounded-xl border border-state-danger/30 bg-state-danger/10 p-3 text-xs text-ink">
                <BellOff className="mt-0.5 size-4 shrink-0 text-state-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-bright">Dado de baja</p>
                  <p className="text-ink-muted">
                    {contact.optOutSource === "keyword" ? "Escribió BAJA/STOP" : "Marcado a mano"} ·{" "}
                    {new Date(contact.optOutAt).toLocaleDateString("es")}. No recibe secuencias ni
                    automatizaciones.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={setOptOut.isPending}
                  onClick={() => setOptOut.mutate({ id: contact.id, optedOut: false })}
                  title="Solo si el contacto pidió volver a recibir mensajes"
                >
                  <BellRing className="size-3.5" /> Reactivar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <span>
                  {contact.consentAt
                    ? `Consentimiento: ${contact.consentSource ?? "registrado"} · ${new Date(contact.consentAt).toLocaleDateString("es")}`
                    : "Sin consentimiento registrado"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={setOptOut.isPending}
                  onClick={() => setOptOut.mutate({ id: contact.id, optedOut: true })}
                >
                  <BellOff className="size-3.5" /> Dar de baja
                </Button>
              </div>
            )}

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
              {contact.attribution ? (
                <div className="flex items-start gap-2 pt-1" data-testid="contact-origin">
                  <Navigation className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                  <div className="min-w-0 text-xs">
                    <p className="text-ink">
                      <span className="text-ink-faint">Origen:</span> {attributionLine(contact.attribution)}
                    </p>
                    <p className="text-ink-faint">
                      {contact.attribution.via === "funnel" && contact.attribution.funnelName
                        ? `Embudo «${contact.attribution.funnelName}»`
                        : contact.attribution.formName
                          ? `Formulario «${contact.attribution.formName}»`
                          : "Formulario"}
                      {" · "}
                      {new Date(contact.attribution.capturedAt).toLocaleDateString("es")}
                      {contact.attribution.landingUrl ? (
                        <span className="block truncate" title={contact.attribution.landingUrl}>
                          {contact.attribution.landingUrl}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Tasks about this contact */}
            <div className="space-y-2" data-testid="contact-tasks">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Tareas</h3>
                <Button variant="ghost" size="sm" onClick={() => setTaskOpen(true)}>
                  <Plus className="size-3.5" />
                  Nueva
                </Button>
              </div>
              {contactTasks.length === 0 ? (
                <p className="py-2 text-center text-xs text-ink-faint">Sin tareas para este contacto.</p>
              ) : (
                <ul className="space-y-1.5">
                  {contactTasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel-raised p-2.5 text-sm"
                    >
                      <KanbanSquare className="size-3.5 shrink-0 text-ink-faint" />
                      <span className={cn("min-w-0 flex-1 truncate text-ink", t.status === "done" && "line-through opacity-70")}>
                        {t.title}
                      </span>
                      {t.dueAt ? (
                        <Badge variant={isOverdue(t) ? "danger" : "outline"}>{dueLabel(t.dueAt)}</Badge>
                      ) : null}
                      <Badge variant={t.priority === "high" ? "danger" : "neutral"}>
                        {TASK_COLUMNS.find((c) => c.status === t.status)?.label ?? PRIORITY_LABEL[t.priority]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
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
      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultContactId={contact?.id}
        members={team.data ?? []}
      />
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
