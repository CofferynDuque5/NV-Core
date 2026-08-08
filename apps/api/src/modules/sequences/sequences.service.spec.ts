import { describe, expect, it, vi } from "vitest";

import { SequencesService } from "./sequences.module";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditLogger } from "../../common/audit-logger.service";
import type { OutboundDispatcher } from "../../providers/outbound-dispatcher.service";

/** A 2-step sequence with one enrollment due now. */
function makeService(stepIndex: number) {
  const steps = [
    { id: "a", delayDays: 0, channel: "email", body: "Bienvenido" },
    { id: "b", delayDays: 2, channel: "wa", body: "¿Dudas?" },
  ];
  const enrollment = {
    id: "en1",
    workspaceSlug: "w1",
    sequenceId: "sq1",
    contactId: "c1",
    stepIndex,
    status: "active",
    nextRunAt: new Date("2026-08-01T00:00:00Z"),
  };
  let updated: Record<string, unknown> | null = null;
  const prisma = {
    enabled: true,
    sequenceEnrollment: {
      findMany: vi.fn(async () => [enrollment]),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updated = data;
        return data;
      }),
    },
    sequence: {
      findUnique: vi.fn(async () => ({ id: "sq1", status: "active", steps })),
    },
    contact: {
      findUnique: vi.fn(async () => ({ id: "c1", email: "c1@x.com", phone: "+52" })),
    },
  };
  const dispatcher = { dispatchMessage: vi.fn(async () => "job1") };
  const svc = new SequencesService(
    prisma as unknown as PrismaService,
    { record: vi.fn() } as unknown as AuditLogger,
    dispatcher as unknown as OutboundDispatcher,
  );
  return { svc, dispatcher, getUpdated: () => updated };
}

describe("SequencesService.processDue", () => {
  it("sends the due step and advances to the next (scheduling it)", async () => {
    const { svc, dispatcher, getUpdated } = makeService(0);
    const res = await svc.processDue(new Date("2026-08-05T00:00:00Z"));
    expect(res.processed).toBe(1);
    // step 0 is email → dispatched to the email address
    expect(dispatcher.dispatchMessage).toHaveBeenCalledWith("w1", "email", "c1@x.com", "Bienvenido");
    const upd = getUpdated()!;
    expect(upd.stepIndex).toBe(1);
    // next step delay is 2 days from the tick time
    expect((upd.nextRunAt as Date).toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(upd.status).toBeUndefined(); // still active
  });

  it("completes the enrollment after the last step", async () => {
    const { svc, dispatcher, getUpdated } = makeService(1);
    await svc.processDue(new Date("2026-08-05T00:00:00Z"));
    // step 1 is wa → dispatched to the phone
    expect(dispatcher.dispatchMessage).toHaveBeenCalledWith("w1", "wa", "+52", "¿Dudas?");
    const upd = getUpdated()!;
    expect(upd.status).toBe("completed");
    expect(upd.nextRunAt).toBeNull();
  });
});
