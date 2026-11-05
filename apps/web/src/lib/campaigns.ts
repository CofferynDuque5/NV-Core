import type { Campaign, CampaignStatus } from "@nv/domain";

/** How each status reads in the panel. */
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  borrador: "Borrador (guardada, no se envía)",
  programada: "Programada",
  activa: "Activa",
  pausada: "Pausada",
  completada: "Terminada",
};

/** Short badge text for each status. */
export const CAMPAIGN_STATUS_SHORT: Record<CampaignStatus, string> = {
  borrador: "Borrador",
  programada: "Programada",
  activa: "Enviando",
  pausada: "Pausada",
  completada: "Terminada",
};

/** The tabs of the Campañas page. */
export type CampaignTab = "marcha" | "borradores" | "pausadas" | "terminadas";

export const CAMPAIGN_TABS: { id: CampaignTab; label: string; statuses: CampaignStatus[] }[] = [
  { id: "marcha", label: "En marcha", statuses: ["activa", "programada"] },
  { id: "borradores", label: "Borradores", statuses: ["borrador"] },
  { id: "pausadas", label: "Pausadas", statuses: ["pausada"] },
  { id: "terminadas", label: "Terminadas", statuses: ["completada"] },
];

export function campaignTab(c: Pick<Campaign, "status">): CampaignTab {
  return CAMPAIGN_TABS.find((t) => t.statuses.includes(c.status))?.id ?? "marcha";
}

/** Value used for campaigns with no category. */
export const NO_CATEGORY = "";

/** The categories in use, sorted, without duplicates (case-insensitive). */
export function campaignCategories(items: Pick<Campaign, "category">[]): string[] {
  const seen = new Map<string, string>();
  for (const c of items) {
    const name = c.category?.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Campaigns of one tab, optionally narrowed to a category and a search text. */
export function filterCampaigns<T extends Pick<Campaign, "status" | "category" | "name">>(
  items: T[],
  opts: { tab: CampaignTab; category?: string | null; query?: string },
): T[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  return items.filter((c) => {
    if (campaignTab(c) !== opts.tab) return false;
    if (opts.category != null) {
      const cat = c.category?.trim().toLowerCase() ?? NO_CATEGORY;
      if (cat !== opts.category.toLowerCase()) return false;
    }
    return !q || c.name.toLowerCase().includes(q) || (c.category ?? "").toLowerCase().includes(q);
  });
}

/** What keeps a campaign from being scheduled (same rules as the server); empty = ready. */
export function campaignReadyProblems(c: {
  message: string;
  attachments: number;
  targets: number;
  social: boolean;
  postToWaStatus: boolean;
  scheduleType: string;
  dateTime: string;
}, now = new Date()): string[] {
  const problems: string[] = [];
  if (!c.message.trim() && c.attachments === 0)
    problems.push("Escribe el mensaje, añade una imagen o un producto.");
  if (c.targets === 0 && !c.social && !c.postToWaStatus) problems.push("Elige al menos un grupo o canal.");
  if (c.scheduleType === "once") {
    if (!c.dateTime) problems.push("Elige la fecha y hora de envío.");
    else if (new Date(c.dateTime).getTime() < now.getTime() - 60_000) {
      problems.push("La fecha de envío ya pasó: elige una fecha futura.");
    }
  }
  return problems;
}

/** When a campaign goes out, as comparable slots: minute of day plus the day it applies to. */
type Slot = { minutes: number; date?: string; weekdays?: number[] };

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function slotsOf(c: {
  scheduleType?: string | null;
  scheduleAt?: string | null;
  scheduleTimes?: string[] | null;
  scheduleDays?: number[] | null;
}): Slot[] {
  if (c.scheduleType === "once") {
    if (!c.scheduleAt) return [];
    const d = new Date(c.scheduleAt);
    if (Number.isNaN(d.getTime())) return [];
    const date = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    return [{ minutes: d.getHours() * 60 + d.getMinutes(), date, weekdays: [d.getDay()] }];
  }
  const times = c.scheduleTimes?.length ? c.scheduleTimes : c.scheduleAt ? [c.scheduleAt] : [];
  const weekdays = c.scheduleType === "weekly" && c.scheduleDays?.length ? c.scheduleDays : undefined;
  return times.flatMap((t) => {
    const minutes = toMinutes(t);
    return minutes === null ? [] : [{ minutes, weekdays }];
  });
}

function slotsMeet(a: Slot, b: Slot, windowMin: number): boolean {
  if (Math.abs(a.minutes - b.minutes) > windowMin) return false;
  if (a.date && b.date) return a.date === b.date;
  if (a.weekdays && b.weekdays) return a.weekdays.some((d) => b.weekdays!.includes(d));
  return true;
}

/**
 * Other scheduled campaigns that go to the same groups within `windowMin`
 * minutes of this one: the groups would get two messages almost together.
 */
type ClashSchedule = {
  scheduleType?: string | null;
  scheduleAt?: string | null;
  scheduleTimes?: string[] | null;
  scheduleDays?: number[] | null;
  targetGroups?: string[] | null;
};

export function scheduleClashes(
  draft: ClashSchedule & { id?: string },
  others: (ClashSchedule & { id: string; name: string; status: string })[],
  windowMin = 15,
): { name: string; groups: number }[] {
  const mine = slotsOf(draft);
  const groups = new Set(draft.targetGroups ?? []);
  if (mine.length === 0 || groups.size === 0) return [];
  return others
    .filter((o) => o.id !== draft.id && (o.status === "programada" || o.status === "activa"))
    .map((o) => ({ o, shared: (o.targetGroups ?? []).filter((g) => groups.has(g)).length }))
    .filter(({ o, shared }) => shared > 0 && slotsOf(o).some((s) => mine.some((m) => slotsMeet(m, s, windowMin))))
    .map(({ o, shared }) => ({ name: o.name, groups: shared }));
}

/** One «Ver como» option of the campaign preview: a country of the chosen groups. */
export interface PreviewCountry {
  /** ISO code; "" = groups without a country. */
  code: string;
  name: string;
  currency: string | null;
  count: number;
}

/** Countries of the chosen groups (most groups first), for the per-country preview. */
export function previewCountries(
  groups: { country?: string | null; detectedCountry?: string | null }[],
  countries: Record<string, { name: string; currency: string }>,
): PreviewCountry[] {
  const by = new Map<string, number>();
  for (const g of groups) {
    const code = g.detectedCountry ?? g.country ?? "";
    const key = code && countries[code] ? code : "";
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([code, count]) => ({
      code,
      name: code ? countries[code]!.name : "Sin país",
      currency: code ? countries[code]!.currency : null,
      count,
    }))
    .sort((a, b) => (a.code === "" ? 1 : b.code === "" ? -1 : b.count - a.count || a.name.localeCompare(b.name)));
}
