import { formatPaymentAmount, type WeeklyReport, type WeeklyReportMetric, type WeeklyReportPayments } from "@nv/domain";

import { csvField } from "./analytics-export";
import { leadSourceLabel } from "./attribution";

/**
 * Weekly report display + CSV. Pure (no DOM) so it is unit-tested; the page
 * only renders and triggers the download.
 */

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** "19 al 25 de oct." / "26 de oct. al 1 de nov." */
export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const [, m1, d1] = weekStart.split("-").map(Number) as [number, number, number];
  const [, m2, d2] = weekEnd.split("-").map(Number) as [number, number, number];
  return m1 === m2
    ? `${d1} al ${d2} de ${MONTHS[m2 - 1]}.`
    : `${d1} de ${MONTHS[m1 - 1]}. al ${d2} de ${MONTHS[m2 - 1]}.`;
}

/** Badge text and colour for a metric against the week before. */
export function metricDelta(m: Pick<WeeklyReportMetric, "value" | "previous">): {
  text: string;
  trend: "up" | "down" | "neutral";
} {
  const diff = m.value - m.previous;
  if (diff === 0) return { text: "igual", trend: "neutral" };
  return { text: `${diff > 0 ? "+" : ""}${diff}`, trend: diff > 0 ? "up" : "down" };
}

/** Workspace section an attention entry links to. */
export function sectionPath(workspace: string, section: string): string {
  return `/w/${workspace}/${section}`;
}

export const SECTION_LABEL: Record<string, string> = {
  tareas: "Tareas",
  inbox: "Inbox",
  calendario: "Calendario",
  campanas: "Campañas",
  automatizaciones: "Automatizaciones",
  cobros: "Cobros",
};

/** Amount in its own currency, and "2 cobros · semana anterior: $ 100.000 COP (1)". */
export function paymentLine(p: WeeklyReportPayments): { amount: string; detail: string } {
  const before = formatPaymentAmount(p.previousAmount, p.currency);
  return {
    amount: formatPaymentAmount(p.amount, p.currency),
    detail: `${p.count} ${p.count === 1 ? "cobro" : "cobros"} · semana anterior: ${before} (${p.previousCount})`,
  };
}

export const WEEKLY_CSV_HEADER = ["seccion", "concepto", "valor", "semana_anterior", "detalle"] as const;

export function weeklyReportCsv(report: WeeklyReport): string {
  const rows: (string | number)[][] = [
    ["Informe", "Semana", `${report.weekStart} a ${report.weekEnd}`, "", report.id === "actual" ? "en curso" : "cerrada"],
    ["Informe", "Generado", report.generatedAt, "", ""],
    ["Informe", "Zona horaria", report.timeZone ?? "UTC", "", ""],
    ...report.metrics.map((m) => ["Actividad", m.label, m.value, m.previous, m.source]),
    ...report.leadSources.map((l) => ["Leads por origen", leadSourceLabel(l.source), l.count, "", ""]),
    // Raw numbers (no thousands separators) so spreadsheets can add them up.
    ...(report.payments ?? []).map((p) => [
      "Cobros confirmados",
      p.currency,
      p.amount,
      p.previousAmount,
      `${p.count} cobros (semana anterior: ${p.previousCount})`,
    ]),
  ];
  for (const a of report.attention) {
    rows.push(["Necesita atención", a.label, a.count, "", ""]);
    for (const item of a.items) rows.push(["Necesita atención", `· ${item.label}`, "", "", item.meta ?? ""]);
  }
  const lines = [WEEKLY_CSV_HEADER.join(","), ...rows.map((r) => r.map(csvField).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function weeklyReportFileName(workspace: string, report: WeeklyReport): string {
  return `informe-semanal-${workspace}-${report.weekStart}${report.id === "actual" ? "-en-curso" : ""}.csv`;
}
