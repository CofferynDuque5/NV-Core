/**
 * Time zones a brand can pick for its weekly report. Each week starts at
 * Monday 00:00 in that zone. Short on purpose: the countries the brands sell
 * in, plus UTC (the default, and what reports used before this setting).
 */
export const REPORT_TIME_ZONES = [
  { id: "UTC", label: "UTC (hora universal)" },
  { id: "America/Bogota", label: "Colombia (Bogotá)" },
  { id: "America/Caracas", label: "Venezuela (Caracas)" },
  { id: "America/Lima", label: "Perú (Lima)" },
  { id: "America/Mexico_City", label: "México (Ciudad de México)" },
  { id: "America/Santiago", label: "Chile (Santiago)" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { id: "America/New_York", label: "EE. UU. (Nueva York / Miami)" },
  { id: "Europe/Madrid", label: "España (Madrid)" },
] as const;

export type ReportTimeZone = (typeof REPORT_TIME_ZONES)[number]["id"];

export const DEFAULT_REPORT_TIME_ZONE: ReportTimeZone = "UTC";

export function isReportTimeZone(v: unknown): v is ReportTimeZone {
  return typeof v === "string" && REPORT_TIME_ZONES.some((z) => z.id === v);
}

export function reportTimeZoneLabel(id: string | undefined): string {
  return REPORT_TIME_ZONES.find((z) => z.id === id)?.label ?? "UTC (hora universal)";
}
