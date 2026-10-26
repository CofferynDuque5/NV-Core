import type { Task } from "@nv/domain";
import { describe, expect, it } from "vitest";

import { dueLabel, filterTasks, groupTasks, initials, isOverdue, positionAt } from "./tasks";

const t = (id: string, position: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: "",
  status: "todo",
  priority: "normal",
  position,
  createdBy: "yo@nv.tv",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...extra,
});

describe("task board helpers", () => {
  it("groups by column and orders by position", () => {
    const g = groupTasks([t("b", 2), t("a", 1), t("c", 1, { status: "done" })]);
    expect(g.todo.map((x) => x.id)).toEqual(["a", "b"]);
    expect(g.doing).toEqual([]);
    expect(g.done.map((x) => x.id)).toEqual(["c"]);
  });

  it("computes a drop position between neighbours, at the ends and in empty columns", () => {
    const col = [t("a", 1), t("b", 2), t("c", 3)];
    expect(positionAt([], 0)).toBe(1);
    expect(positionAt(col, 0)).toBe(0);
    expect(positionAt(col, 1)).toBe(1.5);
    expect(positionAt(col, 3)).toBe(4);
    // Moving "a" to just before "c" ignores its old slot.
    expect(positionAt(col, 2, "a")).toBe(2.5);
    // Dropping "c" at the end of its own column keeps it last.
    expect(positionAt(col, 3, "c")).toBe(3);
  });

  it("filters by text and assignee", () => {
    const list = [
      t("a", 1, { title: "Guion reel", assignee: "Ana@nv.tv" }),
      t("b", 2, { description: "responder reseñas" }),
    ];
    expect(filterTasks(list, { q: "reseñas" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterTasks(list, { assignee: "me", me: "ana@nv.tv" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterTasks(list, { assignee: "none" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterTasks(list, { assignee: "me" })).toEqual([]);
  });

  it("words due dates and flags overdue open tasks only", () => {
    const now = new Date(2026, 9, 26, 15, 0);
    expect(dueLabel(new Date(2026, 9, 26, 9).toISOString(), now)).toBe("Hoy");
    expect(dueLabel(new Date(2026, 9, 27).toISOString(), now)).toBe("Mañana");
    expect(dueLabel(new Date(2026, 9, 25).toISOString(), now)).toBe("Ayer");
    expect(dueLabel(new Date(2026, 10, 3).toISOString(), now)).toBe("3 nov");
    const due = new Date(2026, 9, 25).toISOString();
    expect(isOverdue({ dueAt: due, status: "todo" }, now)).toBe(true);
    expect(isOverdue({ dueAt: due, status: "done" }, now)).toBe(false);
    expect(isOverdue({ dueAt: new Date(2026, 9, 26, 8).toISOString(), status: "todo" }, now)).toBe(false);
  });

  it("builds initials from a name or an email", () => {
    expect(initials("Ana López")).toBe("AL");
    expect(initials("carlos.ruiz@nv.tv")).toBe("CR");
    expect(initials("nathan@nv.tv")).toBe("NA");
  });
});
