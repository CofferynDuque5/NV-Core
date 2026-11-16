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

/**
 * Zone used when a brand never picked one for its campaign times. The brands
 * sell in Venezuela, Colombia and Peru; the server's own clock (often a US or
 * UTC host) sent campaigns hours off. SCHEDULE_TIME_ZONE changes it.
 */
export const DEFAULT_SCHEDULE_TIME_ZONE: ReportTimeZone = "America/Caracas";

/**
 * The zone a brand's daily/weekly campaign times are read in: the zone the
 * brand saved, unless it is still the column default «UTC» (never chosen),
 * then the deployment default, then {@link DEFAULT_SCHEDULE_TIME_ZONE}.
 */
export function scheduleTimeZone(saved?: string | null, deploymentDefault?: string | null): string {
  if (saved && saved !== "UTC" && isReportTimeZone(saved)) return saved;
  const fallback = deploymentDefault?.trim();
  if (fallback && isValidTimeZone(fallback)) return fallback;
  return DEFAULT_SCHEDULE_TIME_ZONE;
}

/** Whether the runtime knows `tz` (an IANA zone such as «America/Caracas»). */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
