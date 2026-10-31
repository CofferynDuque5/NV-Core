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
  if (!c.message.trim() && c.attachments === 0) problems.push("Escribe el mensaje o añade una imagen.");
  if (c.targets === 0 && !c.social && !c.postToWaStatus) problems.push("Elige al menos un grupo o canal.");
  if (c.scheduleType === "once") {
    if (!c.dateTime) problems.push("Elige la fecha y hora de envío.");
    else if (new Date(c.dateTime).getTime() < now.getTime() - 60_000) {
      problems.push("La fecha de envío ya pasó: elige una fecha futura.");
    }
  }
  return problems;
}
