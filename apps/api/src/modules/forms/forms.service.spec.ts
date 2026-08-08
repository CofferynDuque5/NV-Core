import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FormsService } from "./forms.module";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditLogger } from "../../common/audit-logger.service";
import type { PlanService } from "../../common/plan/plan.service";

function makeService(form: Record<string, unknown> | null, existingContact: unknown = null) {
  const created: unknown[] = [];
  const updatedContacts: unknown[] = [];
  const prisma = {
    enabled: true,
    form: {
      findUnique: vi.fn(async () => form),
      update: vi.fn(async () => form),
    },
    contact: {
      findFirst: vi.fn(async () => existingContact),
      create: vi.fn(async ({ data }: { data: unknown }) => {
        created.push(data);
        return data;
      }),
      update: vi.fn(async ({ data }: { data: unknown }) => {
        updatedContacts.push(data);
        return data;
      }),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const plans = { assertWithinLimit: vi.fn(async () => undefined) };
  const svc = new FormsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditLogger,
    plans as unknown as PlanService,
  );
  return { svc, prisma, plans, created, updatedContacts };
}

const baseForm = {
  id: "f1",
  workspaceSlug: "w1",
  fields: [
    { key: "name", label: "Nombre", required: true },
    { key: "email", label: "Correo", required: true },
  ],
  tags: ["newsletter"],
  stage: "Lead",
  submitLabel: "Enviar",
  successMessage: "¡Gracias!",
  redirectUrl: null,
  views: 0,
  submissions: 0,
};

describe("FormsService.submit", () => {
  it("rejects when a required field is missing", async () => {
    const { svc } = makeService(baseForm);
    await expect(svc.submit("f1", { name: "Ana" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a new contact with the form's tags + stage (plan-gated)", async () => {
    const { svc, plans, created } = makeService(baseForm);
    const res = await svc.submit("f1", { name: "Ana", email: "ANA@x.com", phone: "+52" });
    expect(res.ok).toBe(true);
    expect(plans.assertWithinLimit).toHaveBeenCalledWith("w1", "contacts", 1);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      workspaceSlug: "w1",
      email: "ana@x.com", // normalized lowercase
      tags: ["newsletter"],
      stage: "Lead",
    });
  });

  it("dedupes by email — merges tags, no new contact, no plan charge", async () => {
    const { svc, plans, created, updatedContacts } = makeService(baseForm, {
      id: "c1",
      tags: ["vip"],
    });
    await svc.submit("f1", { name: "Ana", email: "ana@x.com" });
    expect(created).toHaveLength(0);
    expect(plans.assertWithinLimit).not.toHaveBeenCalled();
    expect(updatedContacts[0]).toMatchObject({ tags: ["vip", "newsletter"] });
  });

  it("throws when the form does not exist", async () => {
    const { svc } = makeService(null);
    await expect(svc.submit("nope", { email: "a@x.com" })).rejects.toThrow(/no encontrado/);
  });
});

describe("FormsService.getPublic", () => {
  it("returns the public subset and counts a view", async () => {
    const { svc, prisma } = makeService(baseForm);
    const pub = await svc.getPublic("f1");
    expect(pub).toEqual({
      id: "f1",
      name: undefined, // baseForm has no name field set; still shape-correct
      fields: baseForm.fields,
      submitLabel: "Enviar",
    });
    expect(prisma.form.update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { views: { increment: 1 } },
    });
  });
});
