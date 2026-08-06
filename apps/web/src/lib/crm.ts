import { CONTACT_STAGES, type Contact, type ContactStage } from "@nv/domain";

/**
 * Pure CRM helpers — no React, unit-tested. Powers the contact list filters and
 * the pipeline (kanban) grouping.
 */

export const STAGE_ACCENTS: Record<ContactStage, string> = {
  Lead: "#5B8DEF",
  Cliente: "#3FB950",
  "En riesgo": "#E3B341",
  Inactivo: "#8A93A0",
};

export interface ContactFilter {
  q?: string;
  stage?: ContactStage | ""; // "" = any
}

export function filterContacts(items: Contact[], f: ContactFilter): Contact[] {
  const q = f.q?.trim().toLowerCase();
  return items.filter((c) => {
    if (f.stage && c.stage !== f.stage) return false;
    if (q) {
      const hay = [c.name, c.company ?? "", c.email ?? "", c.phone ?? "", ...(c.tags ?? [])]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface StageColumn {
  stage: ContactStage;
  accent: string;
  items: Contact[];
}

/** Group contacts into pipeline columns in canonical stage order (incl. empty). */
export function groupByStage(items: Contact[]): StageColumn[] {
  return CONTACT_STAGES.map((stage) => ({
    stage,
    accent: STAGE_ACCENTS[stage],
    items: items.filter((c) => c.stage === stage),
  }));
}

/** Count of contacts per stage (canonical order). */
export function stageCounts(items: Contact[]): Record<ContactStage, number> {
  const out = Object.fromEntries(CONTACT_STAGES.map((s) => [s, 0])) as Record<ContactStage, number>;
  for (const c of items) if (c.stage in out) out[c.stage] += 1;
  return out;
}
