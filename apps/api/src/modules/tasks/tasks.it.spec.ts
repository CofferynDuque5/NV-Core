import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { TasksService } from "./tasks.module";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Tareas: tablero contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });
  const store = {
    listWorkspaceMembers: async () => [{ user: { email: "Ana@nv.tv" }, role: "Editor" }],
  };
  const audit = { record: async () => undefined };
  const tasks = new TasksService(prisma as never, store as never, audit as never);

  it("crea al final de su columna, mueve y marca la fecha de cierre", async () => {
    const ws = `it-tasks-${Date.now()}`;
    const a = await tasks.create(ws, "yo@nv.tv", { title: " Guion del reel " });
    const b = await tasks.create(ws, "yo@nv.tv", { title: "Responder reseñas", priority: "high" });
    expect(a.title).toBe("Guion del reel");
    expect(a.status).toBe("todo");
    expect(b.position).toBeGreaterThan(a.position);

    const done = await tasks.update(ws, "yo@nv.tv", a.id, { status: "done" });
    expect(done.completedAt).toBeDefined();
    expect(done.position).toBe(1); // bottom of an empty "done" column
    const reopened = await tasks.update(ws, "yo@nv.tv", a.id, { status: "doing", position: 0.5 });
    expect(reopened.completedAt).toBeUndefined();
    expect(reopened.position).toBe(0.5);

    const list = await tasks.list(ws);
    expect(list.map((t) => t.title)).toEqual(["Guion del reel", "Responder reseñas"]);
  });

  it("solo asigna a miembros del workspace y guarda su email real", async () => {
    const ws = `it-tasks-a-${Date.now()}`;
    const t = await tasks.create(ws, "yo@nv.tv", { title: "Fotos", assignee: "ana@NV.tv" });
    expect(t.assignee).toBe("Ana@nv.tv");
    await expect(tasks.create(ws, "yo@nv.tv", { title: "X", assignee: "intruso@x.com" })).rejects.toThrow(
      /no es miembro/,
    );
    const cleared = await tasks.update(ws, "yo@nv.tv", t.id, { assignee: null, dueAt: null });
    expect(cleared.assignee).toBeUndefined();
  });

  it("no deja ver, editar ni borrar tareas de otro workspace", async () => {
    const ws = `it-tasks-i-${Date.now()}`;
    const t = await tasks.create(ws, "yo@nv.tv", { title: "Privada" });
    expect(await tasks.list(`${ws}-otro`)).toEqual([]);
    await expect(tasks.update(`${ws}-otro`, "x", t.id, { title: "hack" })).rejects.toThrow(/no encontrada/);
    await expect(tasks.remove(`${ws}-otro`, "x", t.id)).rejects.toThrow(/no encontrada/);
    await tasks.remove(ws, "yo@nv.tv", t.id);
    expect(await tasks.list(ws)).toEqual([]);
  });
});
