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
  };
  const store = { listWorkspaceMembers: vi.fn(async () => [{ user: { email: "ana@nv.tv" }, role: "Editor" }]) };
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new TasksService(prisma as never, store as never, audit as never), prisma, audit };
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
    const svc = new TasksService({ enabled: false } as never, {} as never, {} as never);
    expect(await svc.list("w1")).toEqual([]);
  });
});
