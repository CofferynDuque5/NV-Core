import { describe, expect, it, vi } from "vitest";

import { InviteLinksService, inviteLinkProblem } from "./invite-links.service";
import { hashToken } from "./token.util";

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 1000);

function makeService(row: Record<string, unknown> | null, opts: { member?: boolean; claimed?: boolean } = {}) {
  const prisma = {
    inviteLink: {
      findUnique: vi.fn(async () => row),
      updateMany: vi.fn(async () => ({ count: opts.claimed === false ? 0 : 1 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "l1",
        uses: 0,
        revokedAt: null,
        createdAt: new Date(),
        ...data,
      })),
    },
  };
  const store = {
    getMembership: vi.fn(async () => (opts.member ? { role: "Admin" } : undefined)),
    upsertMembership: vi.fn(async () => undefined),
    findUserById: vi.fn(async () => ({ name: "Nathan" })),
  };
  const plans = { assertWithinLimit: vi.fn(async () => undefined) };
  const registry = { resolve: vi.fn(async () => ({ name: "NV Streaming" })) };
  const config = { get: vi.fn(() => "https://panel.example") };
  const svc = new InviteLinksService(prisma as never, store as never, plans as never, registry as never, config as never);
  return { svc, prisma, store };
}

const link = { id: "l1", workspaceSlug: "w1", role: "Editor", createdByName: "Nathan", maxUses: null, uses: 0, expiresAt: future, revokedAt: null, createdAt: new Date() };

describe("invite links", () => {
  it("explains revoked, expired and used-up links", () => {
    expect(inviteLinkProblem({ ...link, revokedAt: new Date() })).toMatch(/desactivado/);
    expect(inviteLinkProblem({ ...link, expiresAt: past })).toMatch(/caducó/);
    expect(inviteLinkProblem({ ...link, maxUses: 2, uses: 2 })).toMatch(/todas las veces/);
    expect(inviteLinkProblem(link)).toBeNull();
  });

  it("stores only the token hash and returns a /join link", async () => {
    const { svc, prisma } = makeService(null);
    const created = await svc.create("w1", "u1", { role: "Visor" });
    const data = prisma.inviteLink.create.mock.calls[0]![0].data;
    const token = created.url.split("/join/")[1]!;
    expect(created.url).toMatch(/^https:\/\/panel\.example\/join\//);
    expect(data.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("refuses the Owner role", async () => {
    const { svc } = makeService(null);
    await expect(svc.create("w1", "u1", { role: "Owner" })).rejects.toThrow(/Owner/);
  });

  it("joins with the link's role and counts the use", async () => {
    const { svc, store, prisma } = makeService(link);
    const res = await svc.accept("tok", "u2");
    expect(res).toEqual({ workspaceSlug: "w1", role: "Editor", alreadyMember: false });
    expect(store.upsertMembership).toHaveBeenCalledWith("u2", "w1", "Editor");
    expect(prisma.inviteLink.updateMany).toHaveBeenCalled();
  });

  it("keeps an existing member's role", async () => {
    const { svc, store } = makeService(link, { member: true });
    const res = await svc.accept("tok", "u2");
    expect(res).toMatchObject({ role: "Admin", alreadyMember: true });
    expect(store.upsertMembership).not.toHaveBeenCalled();
  });

  it("refuses expired links and the last seat taken by someone else", async () => {
    await expect(makeService({ ...link, expiresAt: past }).svc.accept("tok", "u2")).rejects.toThrow(/caducó/);
    const { svc, store } = makeService({ ...link, maxUses: 1 }, { claimed: false });
    await expect(svc.accept("tok", "u2")).rejects.toThrow(/todas las veces/);
    expect(store.upsertMembership).not.toHaveBeenCalled();
  });
});
