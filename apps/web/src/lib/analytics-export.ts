import { CHANNELS, type AnalyticsSnapshot, type MetricSource } from "@nv/domain";

import { leadSourceLabel } from "./attribution";
import { scopeLabel } from "./analytics";

/**
 * Analytics snapshot → one flat CSV a spreadsheet can filter by section.
 * Pure (no DOM) so it is unit-tested; the page only triggers the download.
 */

export const ANALYTICS_CSV_HEADER = ["seccion", "metrica", "valor", "detalle", "fuente", "alcance"] as const;

type Row = [string, string, string | number, string, string, string];

/** RFC 4180 field: quote when it holds a separator, quote or newline; neutralise formulas. */
export function csvField(v: string | number): string {
  let s = String(v);
  // A leading = + - @ makes spreadsheets evaluate the cell (CSV injection).
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function src(s: MetricSource | undefined): [string, string] {
  return s ? [s.source, scopeLabel(s.scope)] : ["", ""];
}

export function analyticsRows(snap: AnalyticsSnapshot): Row[] {
  const rows: Row[] = [];
  const range = snap.range;
  if (range) {
    rows.push(["Informe", "Período", `${range.days} días`, `${range.from.slice(0, 10)} a ${range.to.slice(0, 10)}`, "", ""]);
    if (range.compareFrom) {
      rows.push(["Informe", "Comparado con", "", `${range.compareFrom.slice(0, 10)} a ${range.from.slice(0, 10)}`, "", ""]);
    }
  }
  if (snap.generatedAt) rows.push(["Informe", "Generado", snap.generatedAt, "", "", ""]);

  for (const k of snap.kpis) {
    rows.push(["KPI", k.label, k.value, k.delta ? `vs. período anterior: ${k.delta}` : "", ...src(k.source)]);
  }
  for (const c of snap.conversion ?? []) {
    rows.push(["Conversión", c.label, c.value, `${c.pct}%`, ...src(c.source)]);
  }
  const funnelSrc = src(snap.sources?.funnel);
  for (const f of snap.funnel) rows.push(["Embudo CRM", f.label, f.value, `${f.pct}%`, ...funnelSrc]);

  const platSrc = src(snap.sources?.platforms);
  for (const p of snap.platforms) {
    rows.push(["Publicaciones por canal", CHANNELS[p.channel]?.name ?? p.channel, p.count ?? "", p.pct, ...platSrc]);
  }
  const leadSrc = src(snap.sources?.leadSources);
  for (const l of snap.leadSources ?? []) {
    rows.push(["Leads por origen", leadSourceLabel(l.source), l.count, "", ...leadSrc]);
  }
  for (const c of snap.topCampaigns) {
    rows.push(["Campañas", c.name, c.posts, c.status, "", ""]);
  }
  const seriesSrc = src(snap.sources?.series);
  for (const p of snap.series ?? []) {
    rows.push([
      "Actividad diaria",
      p.date,
      p.posts + p.contacts + p.conversations + p.messages,
      `publicaciones ${p.posts} · contactos ${p.contacts} · conversaciones ${p.conversations} · mensajes ${p.messages}`,
      ...seriesSrc,
    ]);
  }
  return rows;
}

/** Full CSV text, with a BOM so Excel opens the accents correctly. */
export function analyticsCsv(snap: AnalyticsSnapshot): string {
  const lines = [ANALYTICS_CSV_HEADER.join(","), ...analyticsRows(snap).map((r) => r.map(csvField).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** "analitica-<workspace>-30d-2026-10-26.csv" */
export function analyticsFileName(workspace: string, snap: AnalyticsSnapshot, ext = "csv"): string {
  const day = (snap.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const days = snap.range ? `-${snap.range.days}d` : "";
  return `analitica-${workspace}${days}-${day}.${ext}`;
}
