import * as React from "react";
import { CalendarClock, KanbanSquare, Plus, Search } from "lucide-react";
import type { Task, TaskStatus } from "@nv/domain";

import { cn } from "@/lib/utils";
import {
  PRIORITY_LABEL,
  TASK_COLUMNS,
  dueLabel,
  filterTasks,
  groupTasks,
  initials,
  isOverdue,
  positionAt,
  type AssigneeFilter,
} from "@/lib/tasks";
import { useTasks, useTeam } from "@/hooks/use-domain-data";
import { useUpdateTask } from "@/hooks/use-domain-mutations";
import { useAuthStore } from "@/stores/auth-store";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskDialog } from "@/components/tasks/task-dialog";

const DRAG_MIME = "application/x-nv-task";

function TaskCard({
  task,
  memberName,
  memberColor,
  onOpen,
  onDropBefore,
}: {
  task: Task;
  memberName?: string;
  memberColor?: string;
  onOpen: () => void;
  onDropBefore: (id: string) => void;
}) {
  const overdue = isOverdue(task);
  return (
    <button
      type="button"
      draggable
      data-testid="task-card"
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_MIME);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        onDropBefore(id);
      }}
      onClick={onOpen}
      className={cn(
        "nv-panel w-full cursor-grab space-y-2 p-3 text-left transition-colors hover:border-line-strong active:cursor-grabbing",
        task.status === "done" && "opacity-70",
      )}
    >
      <div className={cn("text-sm font-medium text-ink-bright", task.status === "done" && "line-through")}>
        {task.title}
      </div>
      {task.description ? <p className="line-clamp-2 text-xs text-ink-muted">{task.description}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {task.priority !== "normal" ? (
          <Badge variant={task.priority === "high" ? "danger" : "neutral"}>{PRIORITY_LABEL[task.priority]}</Badge>
        ) : null}
        {task.dueAt ? (
          <Badge variant={overdue ? "danger" : "outline"} title={new Date(task.dueAt).toLocaleDateString()}>
            <CalendarClock className="size-3" />
            {overdue ? `Vencida · ${dueLabel(task.dueAt)}` : dueLabel(task.dueAt)}
          </Badge>
        ) : null}
        {task.assignee ? (
          <span
            title={memberName ?? task.assignee}
            className="ml-auto grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: memberColor ?? "#5F86F2" }}
          >
            {initials(memberName ?? task.assignee)}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export default function TareasPage() {
  const tasks = useTasks();
  const team = useTeam();
  const update = useUpdateTask();
  const me = useAuthStore((s) => s.user?.email);
  const [q, setQ] = React.useState("");
  const [assignee, setAssignee] = React.useState<AssigneeFilter>("all");
  const [dialog, setDialog] = React.useState<{ task?: Task; status?: TaskStatus } | null>(null);
  const [over, setOver] = React.useState<TaskStatus | null>(null);

  const members = team.data ?? [];
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const all = tasks.data ?? [];
  const columns = groupTasks(filterTasks(all, { q, assignee, me }));
  const fullColumns = groupTasks(all);

  /** Drop `id` into `status` before `beforeId` (or at the end). Positions use the unfiltered column. */
  function move(id: string, status: TaskStatus, beforeId?: string) {
    const task = all.find((t) => t.id === id);
    if (!task) return;
    const col = fullColumns[status];
    const index = beforeId ? col.findIndex((t) => t.id === beforeId) : col.length;
    const position = positionAt(col, index < 0 ? col.length : index, id);
    if (task.status === status && task.position === position) return;
    update.mutate({ id, input: { status, position } });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Equipo"
        title="Tareas"
        description="Tablero del equipo: arrastra las tarjetas entre columnas o ábrelas para editarlas."
        actions={
          <Button onClick={() => setDialog({ status: "todo" })}>
            <Plus className="size-4" />
            Nueva tarea
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            aria-label="Buscar tareas"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tareas…"
            className="pl-9"
          />
        </div>
        <select
          aria-label="Responsable"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="h-9 rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink"
        >
          <option value="all">Todo el equipo</option>
          <option value="me">Mis tareas</option>
          <option value="none">Sin asignar</option>
          {members.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name || m.email}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-ink-faint">
          {all.filter((t) => isOverdue(t)).length > 0
            ? `${all.filter((t) => isOverdue(t)).length} vencida(s)`
            : `${all.length} tarea(s)`}
        </span>
      </div>

      {tasks.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TASK_COLUMNS.map((c) => (
            <Skeleton key={c.status} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Aún no hay tareas"
          description="Crea la primera tarea del equipo: quién hace qué y para cuándo."
          action={
            <Button onClick={() => setDialog({ status: "todo" })}>
              <Plus className="size-4" />
              Nueva tarea
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TASK_COLUMNS.map((c) => (
            <section
              key={c.status}
              aria-label={c.label}
              data-testid={`task-column-${c.status}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.status);
              }}
              onDragLeave={() => setOver((v) => (v === c.status ? null : v))}
              onDrop={(e) => {
                setOver(null);
                const id = e.dataTransfer.getData(DRAG_MIME);
                if (id) move(id, c.status);
              }}
              className={cn(
                "flex min-h-[18rem] flex-col gap-2 rounded-xl border border-line-soft bg-panel/50 p-3 transition-colors",
                over === c.status && "border-brand/50 bg-brand/5",
              )}
            >
              <header className="flex items-center gap-2 px-1 pb-1">
                <span className="size-2 rounded-full" style={{ background: c.accent }} />
                <h2 className="text-sm font-semibold text-ink-bright">{c.label}</h2>
                <span className="text-xs text-ink-faint">{columns[c.status].length}</span>
                <button
                  type="button"
                  aria-label={`Añadir a ${c.label}`}
                  onClick={() => setDialog({ status: c.status })}
                  className="ml-auto rounded-md p-1 text-ink-faint hover:bg-panel-raised hover:text-ink"
                >
                  <Plus className="size-4" />
                </button>
              </header>
              {columns[c.status].map((t) => {
                const m = t.assignee ? byEmail.get(t.assignee.toLowerCase()) : undefined;
                return (
                  <TaskCard
                    key={t.id}
                    task={t}
                    memberName={m?.name}
                    memberColor={m?.avatarColor}
                    onOpen={() => setDialog({ task: t })}
                    onDropBefore={(id) => {
                      setOver(null);
                      if (id !== t.id) move(id, c.status, t.id);
                    }}
                  />
                );
              })}
              {columns[c.status].length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-ink-faint">Arrastra aquí una tarjeta</p>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <TaskDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        task={dialog?.task ?? null}
        defaultStatus={dialog?.status ?? "todo"}
        members={members}
      />
    </div>
  );
}
