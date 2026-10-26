import { describe, expect, it, vi } from "vitest";

import { TasksService, TASKS_LIMIT } from "./tasks.module";

function make(over: Record<string, unknown> = {}) {
  const prisma = {
    enabled: true,
    task: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "t1",
        updatedAt: new Date(),
        createdAt: new Date(),
        ...data,
      })),
      ...over,
    },
    contact: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
        where.id === "c1" && where.workspaceSlug === "w1" ? { name: "Lucía" } : null,
      ),
      findMany: vi.fn(async () => [{ id: "c1", name: "Lucía" }]),
    },
  };
  const store = { listWorkspaceMembers: vi.fn(async () => [{ user: { email: "ana@nv.tv" }, role: "Editor" }]) };
  const audit = { record: vi.fn(async () => undefined) };
  const notifications = { create: vi.fn(async () => undefined) };
  return {
    svc: new TasksService(prisma as never, store as never, audit as never, notifications as never),
    prisma,
    audit,
    notifications,
  };
}

describe("TasksService", () => {
  it("rechaza responsables que no son del workspace sin crear nada", async () => {
    const { svc, prisma } = make();
    await expect(svc.create("w1", "yo@nv.tv", { title: "A", assignee: "otro@x.com" })).rejects.toThrow(/no es miembro/);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("pone la tarea nueva al final de su columna y la registra en auditoría", async () => {
    const { svc, audit } = make({ findFirst: vi.fn(async () => ({ position: 4 })) });
    const t = await svc.create("w1", "yo@nv.tv", { title: "  Copy del post  ", status: "doing" });
    expect(t).toMatchObject({ title: "Copy del post", status: "doing", position: 5, priority: "normal" });
    expect(t.completedAt).toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith("w1", "yo@nv.tv", "task.create", "Copy del post");
  });

  it("limita el tamaño del tablero", async () => {
    const { svc } = make({ count: vi.fn(async () => TASKS_LIMIT) });
    await expect(svc.create("w1", "yo@nv.tv", { title: "A" })).rejects.toThrow(/hasta 500/);
  });

  it("devuelve lista vacía sin base de datos", async () => {
    const svc = new TasksService({ enabled: false } as never, {} as never, {} as never, {} as never);
    expect(await svc.list("w1")).toEqual([]);
  });

  it("enlaza un contacto del mismo workspace y devuelve su nombre", async () => {
    const { svc } = make();
    const t = await svc.create("w1", "yo@nv.tv", { title: "Llamar", contactId: "c1" });
    expect(t).toMatchObject({ contactId: "c1", contactName: "Lucía" });
  });

  it("rechaza contactos de otro workspace sin crear nada", async () => {
    const { svc, prisma } = make();
    await expect(svc.create("w1", "yo@nv.tv", { title: "A", contactId: "c-ajeno" })).rejects.toThrow(/contacto no existe/);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("avisa solo al responsable, y no cuando se asigna a sí mismo", async () => {
    const { svc, notifications } = make();
    await svc.create("w1", "yo@nv.tv", { title: "Editar vídeo", assignee: "ana@nv.tv" });
    expect(notifications.create).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ recipient: "ana@nv.tv", title: "Te asignaron una tarea: Editar vídeo" }),
    );
    notifications.create.mockClear();
    await svc.create("w1", "ana@nv.tv", { title: "Mía", assignee: "ana@nv.tv" });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("al editar solo avisa si cambia el responsable", async () => {
    const current = {
      id: "t1", workspaceSlug: "w1", title: "Copy", description: "", status: "todo", priority: "normal",
      assignee: "ana@nv.tv", dueAt: null, position: 1, createdBy: "yo@nv.tv", createdAt: new Date(),
      updatedAt: new Date(), completedAt: null, contactId: null,
    };
    const { svc, notifications } = make({
      findFirst: vi.fn(async () => current),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })),
    });
    await svc.update("w1", "yo@nv.tv", "t1", { title: "Copy final" });
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
