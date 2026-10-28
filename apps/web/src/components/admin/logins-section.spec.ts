import { describe, expect, it } from "vitest";
import type { AdminLoginEvent, AdminLoginUser } from "@nv/domain";

import { loginStats, sinceLabel } from "./logins-section";

const now = new Date("2026-10-28T20:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();
const H = 3_600_000;

function user(p: Partial<AdminLoginUser>): AdminLoginUser {
  return { id: "u", email: "a@b.c", name: "A", demo: false, createdAt: ago(30 * 24 * H), lastLoginAt: null, lastSeenAt: null, loginCount: 0, emailVerified: true, workspaces: [], ...p };
}

describe("sinceLabel", () => {
  it("reads like a person would say it", () => {
    expect(sinceLabel(null, now)).toBe("Nunca");
    expect(sinceLabel(ago(20_000), now)).toBe("Ahora");
    expect(sinceLabel(ago(5 * 60_000), now)).toBe("Hace 5 min");
    expect(sinceLabel(ago(3 * H), now)).toBe("Hace 3 h");
    expect(sinceLabel(ago(26 * H), now)).toBe("Hace 1 día");
    expect(sinceLabel(ago(3 * 24 * H), now)).toBe("Hace 3 días");
  });
});

describe("loginStats", () => {
  it("counts real users only, and demo visits apart", () => {
    const users = [
      user({ id: "1", lastSeenAt: ago(2 * H), createdAt: ago(2 * 24 * H) }),
      user({ id: "2", lastLoginAt: ago(3 * 24 * H) }),
      user({ id: "3" }),
      user({ id: "d", demo: true, lastSeenAt: ago(H) }),
    ];
    const events: AdminLoginEvent[] = [
      { id: "e1", at: ago(H), method: "demo", email: "d", name: "d", ip: null, device: "—" },
      { id: "e2", at: ago(10 * 24 * H), method: "demo", email: "d", name: "d", ip: null, device: "—" },
      { id: "e3", at: ago(H), method: "password", email: "a", name: "a", ip: null, device: "—" },
    ];
    expect(loginStats(users, events, now)).toEqual({ users: 3, newThisWeek: 1, activeToday: 1, activeWeek: 2, demoVisitsWeek: 1 });
  });
});
