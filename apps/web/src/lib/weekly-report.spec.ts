import { describe, expect, it } from "vitest";
import type { WeeklyReport } from "@nv/domain";

import { metricDelta, weekRangeLabel, weeklyReportCsv, weeklyReportFileName } from "./weekly-report";

const report: WeeklyReport = {
  id: "r1",
  weekStart: "2026-10-12",
  weekEnd: "2026-10-18",
  generatedAt: "2026-10-19T00:05:00.000Z",
  metrics: [{ key: "contacts", label: "Contactos nuevos", value: 3, previous: 1, source: "Contactos creados" }],
  leadSources: [
    { source: "instagram", count: 2 },
    { source: null, count: 1 },
  ],
  attention: [
    {
      key: "sendErrors",
      label: "Envíos de campañas fallidos",
      section: "campanas",
      count: 1,
      items: [{ id: "s1", label: "Promo → VIP", meta: "=HYPERLINK(\"x\")" }],
    },
  ],
};

describe("weekly report helpers", () => {
  it("names the week, also across months", () => {
    expect(weekRangeLabel("2026-10-12", "2026-10-18")).toBe("12 al 18 de oct.");
    expect(weekRangeLabel("2026-10-26", "2026-11-01")).toBe("26 de oct. al 1 de nov.");
  });

  it("compares with the week before", () => {
    expect(metricDelta({ value: 3, previous: 1 })).toEqual({ text: "+2", trend: "up" });
    expect(metricDelta({ value: 0, previous: 4 })).toEqual({ text: "-4", trend: "down" });
    expect(metricDelta({ value: 2, previous: 2 })).toEqual({ text: "igual", trend: "neutral" });
  });

  it("exports every section to CSV, neutralising formulas", () => {
    const csv = weeklyReportCsv(report);
    expect(csv.startsWith("\uFEFFseccion,concepto,valor,semana_anterior,detalle\r\n")).toBe(true);
    expect(csv).toContain("Informe,Semana,2026-10-12 a 2026-10-18,,cerrada");
    expect(csv).toContain("Actividad,Contactos nuevos,3,1,Contactos creados");
    expect(csv).toContain("Leads por origen,instagram,2,,");
    expect(csv).toContain("Necesita atención,Envíos de campañas fallidos,1,,");
    expect(csv).toContain(`Necesita atención,· Promo → VIP,,,"'=HYPERLINK(""x"")"`);
  });

  it("marks the current week in the file name", () => {
    expect(weeklyReportFileName("perla-tour", report)).toBe("informe-semanal-perla-tour-2026-10-12.csv");
    expect(weeklyReportFileName("perla-tour", { ...report, id: "actual" })).toBe(
      "informe-semanal-perla-tour-2026-10-12-en-curso.csv",
    );
  });
});
