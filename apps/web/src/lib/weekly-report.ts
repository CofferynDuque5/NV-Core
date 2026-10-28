import {
  CHANNELS,
  formatPaymentAmount,
  type ChannelId,
  type WeeklyReport,
  type WeeklyReportInbox,
  type WeeklyReportMetric,
  type WeeklyReportPayments,
} from "@nv/domain";

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
    ...inboxCsvRows(report.inbox),
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

/** "8 min", "2 h 5 min", "3 d". */
export function minutesLabel(min: number): string {
  if (min < 60) return `${Math.max(0, Math.round(min))} min`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(min / (24 * 60))} d`;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export function channelLabel(id: string): string {
  return CHANNELS[id as ChannelId]?.name ?? id;
}

/**
 * Plain answer to "is the panel worth it?" from the week's Inbox numbers.
 * Only states what was counted; never estimates sales or money.
 */
export function inboxVerdict(i: WeeklyReportInbox): { tone: "good" | "neutral" | "empty"; headline: string; lines: string[] } {
  if (i.conversations === 0) {
    return {
      tone: "empty",
      headline: "Sin conversaciones nuevas esta semana",
      lines: ["Conecta WhatsApp, Instagram o Telegram y lanza una campaña: aquí verás cuántas conversaciones trae el panel."],
    };
  }
  const lines = [
    `${i.fromPanel} de ${i.conversations} conversaciones nuevas (${pct(i.fromPanel, i.conversations)} %) llegaron gracias al panel: ` +
      `${i.afterCampaign} en las 48 h después de una campaña y ${i.fromForms} de contactos que entraron por tus formularios.`,
  ];
  let answered = `Respondiste ${i.answered} de ${i.conversations} (${pct(i.answered, i.conversations)} %)`;
  if (i.medianReplyMinutes !== null) answered += `; la primera respuesta tardó normalmente ${minutesLabel(i.medianReplyMinutes)}`;
  lines.push(`${answered}.`);
  const diff = i.fromPanel - i.previousFromPanel;
  if (diff !== 0) lines.push(`Frente a la semana anterior: ${diff > 0 ? "+" : "-"}${Math.abs(diff)} (antes ${i.previousFromPanel}).`);
  return i.fromPanel > 0
    ? { tone: "good", headline: "Sí: el panel te está trayendo conversaciones", lines }
    : {
        tone: "neutral",
        headline: "Todavía no se nota el panel en el Inbox",
        lines: [...lines, "Lanza una campaña o comparte un formulario y compara la próxima semana."],
      };
}

function inboxCsvRows(i: WeeklyReportInbox | undefined): (string | number)[][] {
  if (!i) return [];
  return [
    ["Inbox", "Conversaciones nuevas", i.conversations, i.previousConversations, ""],
    ["Inbox", "Gracias al panel", i.fromPanel, i.previousFromPanel, "después de una campaña (48 h) o desde un formulario"],
    ["Inbox", "Después de una campaña", i.afterCampaign, "", "empezaron hasta 48 h después de un envío confirmado"],
    ["Inbox", "Desde formularios", i.fromForms, "", "el teléfono coincide con un contacto de formulario o embudo"],
    ["Inbox", "Respondidas", i.answered, "", ""],
    ["Inbox", "Primera respuesta (mediana, min)", i.medianReplyMinutes ?? "", "", ""],
    ...i.byChannel.map((c) => ["Inbox por canal", channelLabel(c.channel), c.count, "", ""]),
  ];
}
