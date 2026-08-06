import { describe, expect, it, vi } from "vitest";

import { TeamService } from "./team.module";

type Row = { user: { id: string; name: string; email: string }; role: string };

function make(rows: Row[]) {
  const store = { listWorkspaceMembers: vi.fn(async () => rows) };
  return { service: new TeamService(store as never), store };
}

const rows: Row[] = [
  { user: { id: "u1", name: "Ana", email: "ana@x.com" }, role: "Owner" },
  { user: { id: "u2", name: "Bob", email: "bob@x.com" }, role: "Editor" },
  { user: { id: "u3", name: "Cira", email: "cira@x.com" }, role: "Editor" },
];

describe("TeamService.members", () => {
  it("maps stored members to the shared TeamMember shape (scoped to the workspace)", async () => {
    const { service, store } = make(rows);
    const members = await service.members("w1");
    expect(store.listWorkspaceMembers).toHaveBeenCalledWith("w1");
    expect(members.map((m) => m.email)).toEqual(["ana@x.com", "bob@x.com", "cira@x.com"]);
    expect(members[0]).toMatchObject({ id: "u1", role: "Owner", online: false });
    expect(members[0]!.avatarColor).toMatch(/^#/);
  });
});

describe("TeamService.roles", () => {
  it("returns every role in canonical order with real membership counts", async () => {
    const { service } = make(rows);
    const roles = await service.roles("w1");
    expect(roles.map((r) => r.id)).toEqual(["Owner", "Admin", "Editor", "Visor"]);
    const byId = Object.fromEntries(roles.map((r) => [r.id, r.userCount]));
    expect(byId).toEqual({ Owner: 1, Admin: 0, Editor: 2, Visor: 0 });
    expect(roles.every((r) => typeof r.description === "string" && r.description.length > 0)).toBe(true);
  });

  it("returns zero counts for an empty workspace", async () => {
    const { service } = make([]);
    const roles = await service.roles("w1");
    expect(roles.every((r) => r.userCount === 0)).toBe(true);
  });
});
