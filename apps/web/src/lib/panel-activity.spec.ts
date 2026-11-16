import { describe, expect, it } from "vitest";
import type { AdminPanelSession } from "@nv/domain";

import { activitySummary, durationLabel, isLive, sectionLabel, sectionOfPath, visitMs } from "./panel-activity";

const now = new Date("2026-11-08T20:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

function visit(p: Partial<AdminPanelSession>): AdminPanelSession {
  return {
    id: "v",
    userId: "u1",
    email: "ana@nv.tv",
    name: "Ana",
    demo: false,
    device: "Chrome · Windows",
    deviceKind: "computadora",
    ip: null,
    workspaceSlug: "mi-marca",
    lastPath: "/w/mi-marca/campanas",
    pageViews: 1,
    sections: { campanas: 1 },
    startedAt: ago(10 * 60_000),
    lastAt: ago(60_000),
    ...p,
  };
}

describe("panel activity", () => {
  it("names sections and times like a person", () => {
    expect(sectionLabel("campanas")).toBe("Campañas");
    expect(sectionLabel("dashboard")).toBe("Inicio");
    expect(sectionLabel("raro")).toBe("Raro");
    expect(sectionOfPath("/w/x/inbox?c=1")).toBe("inbox");
    expect(sectionOfPath("/w/x")).toBe("dashboard");
    expect(durationLabel(30_000)).toBe("30 s");
    expect(durationLabel(12 * 60_000)).toBe("12 min");
    expect(durationLabel(65 * 60_000)).toBe("1 h 05 min");
    expect(visitMs(visit({}))).toBe(10 * 60_000);
  });

  it("counts who is live, time per user, devices, sections and demo visits", () => {
    const s = activitySummary(
      [
        visit({ id: "a", pageViews: 3, sections: { campanas: 2, inbox: 1 } }),
        visit({ id: "b", lastAt: ago(2 * 3_600_000), startedAt: ago(3 * 3_600_000), device: "Safari · iPhone/iPad", deviceKind: "movil" }),
        visit({ id: "c", userId: "demo", demo: true, sections: { dashboard: 1 } }),
      ],
      now,
    );
    expect(s.live).toBe(2);
    expect(isLive(visit({ lastAt: ago(5 * 60_000) }), now)).toBe(false);
    expect(s.demoVisits).toBe(1);
    expect(s.byUser.get("u1")).toEqual({
      visits: 2,
      ms: 10 * 60_000 + 61 * 60_000,
      devices: ["Chrome · Windows", "Safari · iPhone/iPad"],
      pageViews: 4,
    });
    expect(s.byKind).toEqual([["Computadora", 2], ["Móvil", 1]]);
    expect(s.bySection[0]).toEqual(["Campañas", 3]);
  });
});
