import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantService } from "./assistant.service";

/**
 * The panel assistant on Gemini function calling: the model asks for a tool,
 * we execute it against the workspace and feed the result back, and the final
 * text answer comes out. `fetch` is stubbed (no network).
 */
afterEach(() => vi.restoreAllMocks());

function build() {
  const created: unknown[] = [];
  const prisma = {
    enabled: true,
    contact: {
      count: async () => 3,
      findMany: async () => [{ name: "Ana", phone: "+58412", stage: "Lead", tags: ["netflix"] }],
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "c1", ...data };
      },
      update: async () => ({}),
    },
    campaign: { findMany: async () => [], findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    group: { findMany: async () => [{ name: "Ventas Caracas", channel: "wa", members: 120, kind: "group" }] },
    post: { findMany: async () => [], create: async () => ({}) },
    conversation: { findMany: async () => [], findFirst: async () => null, update: async () => ({}) },
    automation: { findMany: async () => [{ name: "Agente", status: "activo", runs: 2 }] },
    sendLog: { count: async () => 0, findMany: async () => [] },
    whatsappSession: { findUnique: async () => ({ status: "connected", number: "+58422", groupsCount: 5 }) },
    telegramSession: { findUnique: async () => null },
  };
  const jobs = { dispatch: vi.fn(async () => "job1") };
  const providers = { sendByChannel: vi.fn(async () => ({ id: "m1" })) };
  const svc = new AssistantService(prisma as never, jobs as never, providers as never);
  return { svc, created, jobs, providers };
}

describe("AssistantService", () => {
  it("puts the whole panel state in the prompt", async () => {
    const { svc } = build();
    const snap = await svc.snapshot("ws");
    expect(snap).toMatch(/WhatsApp connected/);
    expect(snap).toMatch(/Ventas Caracas/);
    expect(snap).toMatch(/Ana \+58412/);
    expect(snap).toMatch(/Agente \(activo, 2/);
  });

  it("executes a tool call requested by Gemini and returns the final answer", async () => {
    const { svc, created } = build();
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const round = bodies.length;
      const json =
        round === 1
          ? { candidates: [{ content: { parts: [{ functionCall: { name: "crear_contacto", args: { name: "Pedro", phone: "+58414", tags: ["hbo"] } } }] } }] }
          : { candidates: [{ content: { parts: [{ text: "Listo: creé a Pedro (+58414) con etiqueta hbo." }] } }] };
      return { ok: true, json: async () => json } as never;
    });

    const reply = await svc.chat("ws", "AIza", "gemini-2.5-flash", [{ role: "user", content: "crea el contacto Pedro +58414 hbo" }]);

    expect(reply).toMatch(/Pedro/);
    expect(created[0]).toMatchObject({ workspaceSlug: "ws", name: "Pedro", phone: "+58414", tags: ["hbo"] });
    // Round 2 carries the tool result back to the model.
    const second = bodies[1] as { contents: { role: string; parts: { functionResponse?: { name: string } }[] }[] };
    expect(second.contents.at(-1)?.parts[0]?.functionResponse?.name).toBe("crear_contacto");
    // Tools are declared on every call and the system prompt carries the snapshot.
    const first = bodies[0] as { tools: unknown[]; systemInstruction: { parts: { text: string }[] } };
    expect(first.tools).toHaveLength(1);
    expect(first.systemInstruction.parts[0]?.text).toMatch(/ESTADO DEL PANEL/);
  });

  it("'enviar ahora' dispatches the campaign job", async () => {
    const { svc, jobs } = build();
    // Make the campaign lookup succeed for this case.
    (svc as unknown as { prisma: { campaign: { findFirst: () => Promise<unknown> } } }).prisma.campaign.findFirst = async () => ({ id: "camp1", name: "Promo" });
    const out = (await svc.execute("ws", "campana_accion", { campana: "Promo", accion: "enviar_ahora" })) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(jobs.dispatch).toHaveBeenCalledWith("campaign.run", "ws", { workspaceSlug: "ws", campaignId: "camp1" });
  });
});
