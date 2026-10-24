import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { SequencesService } from "../sequences/sequences.module";
import { ConsentService } from "./consent.service";

const url = process.env.IT_DATABASE_URL;
describe.skipIf(!url)("Bajas contra PostgreSQL real", () => {
  const prisma = Object.assign(new PrismaClient({ datasourceUrl: url }), { enabled: true });

  it("tras un «BAJA» la secuencia se detiene y no vuelve a inscribirse", async () => {
    const ws = `it-consent-${Date.now()}`;
    let handler: ((p: unknown) => Promise<void>) | null = null;
    const consent = new ConsentService(
      prisma as never,
      { on: (_e: string, h: (p: unknown) => Promise<void>) => ((handler = h), () => undefined) } as never,
      { record: vi.fn() } as never,
    );
    consent.onModuleInit();
    const dispatchMessage = vi.fn(async () => "job");
    const sequences = new SequencesService(prisma as never, { record: vi.fn() } as never, { dispatchMessage } as never);

    const ana = await prisma.contact.create({ data: { workspaceSlug: ws, name: "Ana", phone: "+57 300 111 2233", tags: ["promo"] } });
    await prisma.contact.create({ data: { workspaceSlug: ws, name: "Beto", phone: "+573004445566", tags: ["promo"] } });
    const seq = await prisma.sequence.create({
      data: {
        workspaceSlug: ws, name: "Promo", status: "active",
        steps: [{ channel: "wa", delayDays: 0, body: "Hola" }, { channel: "wa", delayDays: 1, body: "¿Seguimos?" }],
      },
    });
    expect((await sequences.enroll(ws, "u", seq.id, { tag: "promo" })).enrolled).toBe(2);

    await handler!({ workspaceSlug: ws, channel: "wa", contactHandle: "573001112233", contactName: "Ana", text: "BAJA" });

    await sequences.processDue(new Date(Date.now() + 60_000));
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
    expect((dispatchMessage.mock.calls[0] as unknown[])[2]).toBe("+573004445566");
    const e = await prisma.sequenceEnrollment.findUnique({ where: { sequenceId_contactId: { sequenceId: seq.id, contactId: ana.id } } });
    expect(e!.status).toBe("opted_out");

    // Una nueva inscripción por etiqueta la salta.
    const seq2 = await prisma.sequence.create({ data: { workspaceSlug: ws, name: "Otra", status: "active", steps: [] } });
    const r = await sequences.enroll(ws, "u", seq2.id, { tag: "promo" });
    expect(r).toMatchObject({ enrolled: 1, optedOut: 1 });
  });
});
