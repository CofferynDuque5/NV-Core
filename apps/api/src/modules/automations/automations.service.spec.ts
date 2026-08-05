import { describe, expect, it, vi } from "vitest";

import { AutomationsService, type UpdateAutomationDto } from "./automations.module";
import type { PrismaService } from "../../prisma/prisma.service";

interface Row {
  id: string;
  workspaceSlug: string;
  name: string;
  description: string | null;
  status: string;
  runs: number;
  nodes: unknown;
  edges: unknown;
  webhookUrl: string | null;
}

function makeService(seed: Row[] = []) {
  const rows = [...seed];
  const prisma = {
    enabled: true,
    automation: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
        rows.find((r) => r.id === where.id && r.workspaceSlug === where.workspaceSlug) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new AutomationsService(prisma as unknown as PrismaService, audit as never, {} as never);
  return { service, rows, audit };
}

function baseRow(over: Partial<Row> = {}): Row {
  return {
    id: "a1",
    workspaceSlug: "w1",
    name: "Onboarding",
    description: "",
    status: "pausado",
    runs: 0,
    nodes: [],
    edges: [],
    webhookUrl: null,
    ...over,
  };
}

describe("AutomationsService.update", () => {
  it("persists the node graph and metadata", async () => {
    const { service } = makeService([baseRow()]);
    const dto: UpdateAutomationDto = {
      name: "Onboarding v2",
      status: "activo",
      nodes: [{ id: "n1", type: "trigger", label: "Nuevo contacto" }],
      edges: [{ id: "e1", from: "n1", to: "n2" }],
    };
    const res = await service.update("w1", "actor@x", "a1", dto);
    expect(res.name).toBe("Onboarding v2");
    expect(res.status).toBe("activo");
    expect(res.nodes).toHaveLength(1);
    expect(res.edges).toHaveLength(1);
  });

  it("leaves omitted fields untouched (partial update)", async () => {
    const { service, rows } = makeService([
      baseRow({ name: "Keep", webhookUrl: "https://n8n/hook" }),
    ]);
    await service.update("w1", "actor@x", "a1", { status: "activo" });
    expect(rows[0]!.name).toBe("Keep"); // unchanged
    expect(rows[0]!.webhookUrl).toBe("https://n8n/hook"); // unchanged
    expect(rows[0]!.status).toBe("activo"); // changed
  });

  it("records an audit entry", async () => {
    const { service, audit } = makeService([baseRow()]);
    await service.update("w1", "actor@x", "a1", { name: "X" });
    expect(audit.record).toHaveBeenCalledWith("w1", "actor@x", "automation.update", "a1");
  });

  it("throws when the automation is missing or in another workspace", async () => {
    const { service } = makeService([baseRow()]);
    await expect(service.update("w1", "actor@x", "nope", { name: "X" })).rejects.toThrow(/no encontrada/);
    await expect(service.update("w2", "actor@x", "a1", { name: "X" })).rejects.toThrow(/no encontrada/);
  });
});
