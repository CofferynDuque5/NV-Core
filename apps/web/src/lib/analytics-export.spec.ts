import type { AnalyticsSnapshot } from "@nv/domain";
import { describe, expect, it } from "vitest";

import { analyticsCsv, analyticsFileName, analyticsRows, csvField } from "./analytics-export";

const src = { source: "Contactos del CRM", scope: "period" as const, method: "Cuenta los creados" };
const snap: AnalyticsSnapshot = {
  kpis: [{ label: "Contactos nuevos", value: "12", delta: "+20%", deltaTrend: "up", source: src }],
  funnel: [{ label: "Lead", value: "8", pct: 66, accent: "#5B8DEF" }],
  platforms: [{ channel: "ig", pct: "75%", count: 3 }],
  heatmap: [],
  topCampaigns: [],
  range: { days: 30, from: "2026-09-26T00:00:00.000Z", to: "2026-10-26T00:00:00.000Z", compareFrom: "2026-08-27T00:00:00.000Z" },
  series: [{ date: "2026-10-25", posts: 1, contacts: 2, conversations: 0, messages: 4 }],
  generatedAt: "2026-10-26T15:00:00.000Z",
  sources: { series: src, platforms: src, funnel: src, leadSources: src } as AnalyticsSnapshot["sources"],
  leadSources: [{ source: "instagram", count: 5 }, { source: null, count: 2 }],
};

describe("analytics CSV", () => {
  it("escapa comas, comillas y saltos, y neutraliza fórmulas", () => {
    expect(csvField('Hola, "mundo"')).toBe('"Hola, ""mundo"""');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(-3)).toBe("-3");
  });

  it("incluye período, KPIs con fuente, canales, orígenes y actividad diaria", () => {
    const rows = analyticsRows(snap);
    expect(rows[0]).toEqual(["Informe", "Período", "30 días", "2026-09-26 a 2026-10-26", "", ""]);
    expect(rows).toContainEqual(["KPI", "Contactos nuevos", "12", "vs. período anterior: +20%", "Contactos del CRM", "período"]);
    expect(rows.find((r) => r[0] === "Publicaciones por canal")?.[2]).toBe(3);
    expect(rows.filter((r) => r[0] === "Leads por origen").map((r) => r[1])).toEqual([
      "instagram",
      "Sin origen (manual, importación o chat)",
    ]);
    expect(rows.find((r) => r[0] === "Actividad diaria")?.[2]).toBe(7);
  });

  it("empieza con BOM y cabecera, y nombra el archivo por workspace y período", () => {
    const csv = analyticsCsv(snap);
    expect(csv.startsWith("﻿seccion,metrica,valor,detalle,fuente,alcance\r\n")).toBe(true);
    expect(analyticsFileName("fitness", snap)).toBe("analitica-fitness-30d-2026-10-26.csv");
  });
});
