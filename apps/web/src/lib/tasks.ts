import type { Task, TaskPriority, TaskStatus } from "@nv/domain";

/**
 * Pure task-board helpers — no React, unit-tested. The page stays declarative;
 * ordering, filtering and due-date wording live here.
 */

export const TASK_COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "todo", label: "Pendiente", accent: "#5B8DEF" },
  { status: "doing", label: "En curso", accent: "#E3B341" },
  { status: "done", label: "Hecha", accent: "#3FB950" },
];

export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Baja", normal: "Normal", high: "Alta" };

/** Assignee filter: everyone, the current user, nobody, or a member's email. */
export type AssigneeFilter = "all" | "me" | "none" | (string & {});

export interface TaskFilter {
  q?: string;
  assignee?: AssigneeFilter;
  me?: string;
}

export function filterTasks(tasks: Task[], f: TaskFilter): Task[] {
  const q = f.q?.trim().toLowerCase() ?? "";
  const who = f.assignee ?? "all";
  return tasks.filter((t) => {
    if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
    if (who === "all") return true;
    if (who === "none") return !t.assignee;
    const email = who === "me" ? f.me : who;
    return !!email && t.assignee?.toLowerCase() === email.toLowerCase();
  });
}

/** Tasks split into board columns, each ordered by position. */
export function groupTasks(tasks: Task[]): Record<TaskStatus, Task[]> {
  const out: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
  for (const t of tasks) out[t.status]?.push(t);
  for (const col of Object.values(out)) col.sort((a, b) => a.position - b.position);
  return out;
}

/**
 * Position for a card dropped into `column` before the card at `index`
 * (`index === column.length` appends). The moving card itself is ignored, so
 * re-dropping a card in its own column works.
 */
export function positionAt(column: Task[], index: number, movingId?: string): number {
  const others = column.filter((t) => t.id !== movingId);
  const beforeId = column[index]?.id;
  const at = beforeId === undefined ? others.length : others.findIndex((t) => t.id === beforeId);
  const slot = at < 0 ? others.length : at;
  const prev = others[slot - 1];
  const next = others[slot];
  if (!prev && !next) return 1;
  if (!prev) return next!.position - 1;
  if (!next) return prev.position + 1;
  return (prev.position + next.position) / 2;
}

const DAY_MS = 86_400_000;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** An open task whose due date is before today. */
export function isOverdue(t: Pick<Task, "dueAt" | "status">, now = new Date()): boolean {
  if (!t.dueAt || t.status === "done") return false;
  return startOfDay(new Date(t.dueAt)) < startOfDay(now);
}

/** "Hoy", "Mañana", "Ayer", or "3 nov" (local time). */
export function dueLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Ana López" → "AL"; falls back to the email's first letters. */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0]!.replace(/[._-]+/g, " ") : nameOrEmail;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
