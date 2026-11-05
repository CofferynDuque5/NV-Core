import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_SHORT,
  CAMPAIGN_TABS,
  campaignCategories,
  campaignTab,
  filterCampaigns,
} from "./campaigns";

const items = [
  { name: "Promo verano", status: "activa" as const, category: "Ventas" },
  { name: "Aviso lunes", status: "programada" as const, category: "ventas " },
  { name: "Idea nueva", status: "borrador" as const, category: null },
  { name: "Viejo", status: "completada" as const, category: "Ánimo" },
  { name: "En pausa", status: "pausada" as const, category: undefined },
];

describe("campañas: pestañas y categorías", () => {
  it("cada estado tiene texto y cae en una pestaña", () => {
    for (const t of CAMPAIGN_TABS) {
      for (const s of t.statuses) {
        expect(CAMPAIGN_STATUS_LABEL[s]).toBeTruthy();
        expect(CAMPAIGN_STATUS_SHORT[s]).toBeTruthy();
        expect(campaignTab({ status: s })).toBe(t.id);
      }
    }
  });

  it("lista las categorías sin repetir y ordenadas", () => {
    expect(campaignCategories(items)).toEqual(["Ánimo", "Ventas"]);
  });

  it("filtra por pestaña, categoría y texto", () => {
    expect(filterCampaigns(items, { tab: "marcha" }).map((c) => c.name)).toEqual(["Promo verano", "Aviso lunes"]);
    expect(filterCampaigns(items, { tab: "marcha", category: "VENTAS" })).toHaveLength(2);
    expect(filterCampaigns(items, { tab: "borradores", category: "" }).map((c) => c.name)).toEqual(["Idea nueva"]);
    expect(filterCampaigns(items, { tab: "marcha", query: "lunes" }).map((c) => c.name)).toEqual(["Aviso lunes"]);
    expect(filterCampaigns(items, { tab: "marcha", query: "ventas" })).toHaveLength(2);
    expect(filterCampaigns(items, { tab: "terminadas", query: "nada" })).toEqual([]);
  });
});

import { scheduleClashes } from "./campaigns";

describe("scheduleClashes", () => {
  const other = (over: Record<string, unknown>) => ({
    id: "o1",
    name: "Recordatorio",
    status: "programada",
    scheduleType: "daily",
    scheduleTimes: ["19:00"],
    targetGroups: ["g1", "g2"],
    ...over,
  });
  it("warns when another campaign goes to the same groups within 15 minutes", () => {
    const r = scheduleClashes({ scheduleType: "daily", scheduleTimes: ["19:10"], targetGroups: ["g2", "g3"] }, [other({})]);
    expect(r).toEqual([{ name: "Recordatorio", groups: 1 }]);
  });
  it("ignores other hours, other groups, other weekdays and paused campaigns", () => {
    const d = { scheduleType: "daily", scheduleTimes: ["19:00"], targetGroups: ["g1"] };
    expect(scheduleClashes({ ...d, scheduleTimes: ["21:00"] }, [other({})])).toEqual([]);
    expect(scheduleClashes({ ...d, targetGroups: ["g9"] }, [other({})])).toEqual([]);
    expect(scheduleClashes(d, [other({ status: "pausada" })])).toEqual([]);
    expect(
      scheduleClashes({ ...d, scheduleType: "weekly", scheduleDays: [1] }, [other({ scheduleType: "weekly", scheduleDays: [3] })]),
    ).toEqual([]);
  });
});
