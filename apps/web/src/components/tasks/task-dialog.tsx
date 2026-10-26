import * as React from "react";
import { Trash2 } from "lucide-react";
import type { Task, TaskPriority, TaskStatus, TeamMember } from "@nv/domain";

import { useCreateTask, useDeleteTask, useUpdateTask } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { FormDialog, errorMessage } from "@/components/entities/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_LABEL, TASK_COLUMNS } from "@/lib/tasks";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

/** ISO → "YYYY-MM-DD" in local time, for <input type="date">. */
function toDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → ISO at local noon, so the day never shifts across time zones. */
function fromDateInput(v: string): string | null {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12).toISOString();
}

/** Create a task (no `task`) or edit one, including moving and deleting it. */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultStatus = "todo",
  members,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  defaultStatus?: TaskStatus;
  members: TeamMember[];
}) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const confirm = useConfirm();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [assignee, setAssignee] = React.useState("");
  const [due, setDue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? defaultStatus);
    setPriority(task?.priority ?? "normal");
    setAssignee(task?.assignee ?? "");
    setDue(toDateInput(task?.dueAt));
    setError(null);
  }, [open, task, defaultStatus]);

  const done = { onSuccess: () => onOpenChange(false), onError: (err: unknown) => setError(errorMessage(err)) };

  function submit() {
    setError(null);
    const base = { title: title.trim(), description: description.trim(), status, priority };
    if (task) {
      update.mutate(
        { id: task.id, input: { ...base, assignee: assignee || null, dueAt: due ? fromDateInput(due) : null } },
        done,
      );
    } else {
      create.mutate(
        { ...base, assignee: assignee || undefined, dueAt: (due && fromDateInput(due)) || undefined },
        done,
      );
    }
  }

  // Keep a departed member visible instead of silently unassigning the task.
  const options = members.map((m) => ({ email: m.email, name: m.name }));
  if (assignee && !options.some((o) => o.email.toLowerCase() === assignee.toLowerCase())) {
    options.push({ email: assignee, name: `${assignee} (ya no es miembro)` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? "Editar tarea" : "Nueva tarea"}
      description={task ? `Creada por ${task.createdBy}` : "Se añade al final de la columna elegida."}
      onSubmit={submit}
      pending={create.isPending || update.isPending}
      error={error}
      submitLabel={task ? "Guardar" : "Crear tarea"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="tk-title">Título</Label>
        <Input
          id="tk-title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Grabar el reel del lanzamiento"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tk-desc">Descripción</Label>
        <Textarea
          id="tk-desc"
          rows={3}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalles, enlaces, criterios de listo…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tk-status">Columna</Label>
          <select id="tk-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={selectCls}>
            {TASK_COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tk-priority">Prioridad</Label>
          <select
            id="tk-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className={selectCls}
          >
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tk-assignee">Responsable</Label>
          <select id="tk-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectCls}>
            <option value="">Sin asignar</option>
            {options.map((o) => (
              <option key={o.email} value={o.email}>
                {o.name || o.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tk-due">Fecha límite</Label>
          <Input id="tk-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      {task ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-state-danger hover:text-state-danger"
          disabled={remove.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: "Eliminar tarea",
              description: `¿Eliminar «${task.title}»? No se puede deshacer.`,
              confirmLabel: "Eliminar",
              destructive: true,
            });
            if (ok) remove.mutate(task.id, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <Trash2 className="size-3.5" />
          Eliminar tarea
        </Button>
      ) : null}
    </FormDialog>
  );
}
