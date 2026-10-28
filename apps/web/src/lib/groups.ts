import { GROUP_COUNTRIES, groupPostingProblems, type Group } from "@nv/domain";

/**
 * Pure helpers for the Grupos screen and the campaign group picker.
 * Categories are modeled on the group's `tags` (a group can carry several),
 * so the user can separate e.g. "universidad" from "trabajo" and filter by them.
 */

/** Sorted, de-duplicated list of every category (tag) used across the groups. */
export function groupCategories(items: Group[]): string[] {
  const set = new Set<string>();
  for (const g of items) for (const t of g.tags ?? []) if (t.trim()) set.add(t.trim());
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Filter groups by a free-text query (matches name or JID) and, optionally, a
 * category. `category` of "" or null means "all categories".
 */
export function filterGroups(
  items: Group[],
  opts: { q?: string; category?: string | null } = {},
): Group[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  const category = (opts.category ?? "").trim();
  return items.filter((g) => {
    if (category && !(g.tags ?? []).includes(category)) return false;
    if (!q) return true;
    const hay = `${g.name} ${g.remoteJid ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Where a group stands for campaigns, ignoring price/photo (those depend on each campaign). */
export type GroupPostingStatus = "apto" | "apartado" | "no-apto";

export function groupStatus(g: Group): { status: GroupPostingStatus; reasons: string[] } {
  if (g.excluded) return { status: "apartado", reasons: ["Apartado: nunca se publica aquí."] };
  const reasons = groupPostingProblems({ ...g, requiresPrice: false, requiresImage: false }, { hasImage: true });
  return { status: reasons.length ? "no-apto" : "apto", reasons };
}

/** "Venezuela · Bs (por el nombre)" for the group's country, or null. */
export function countryLine(g: Group): string | null {
  const id = g.detectedCountry ?? g.country;
  const c = id ? GROUP_COUNTRIES[id] : null;
  if (!c) return null;
  const how = g.countrySource === "nombre" ? " (por el nombre)" : g.countrySource === "creador" ? " (por el creador)" : "";
  return `${c.name} · ${c.symbol}${how}`;
}

/** Requirement badges shown next to a group. */
export function requirementLabels(g: Group): string[] {
  const out: string[] = [];
  if (g.requiresPrice) out.push("Exige precio");
  if (g.requiresImage) out.push("Exige foto");
  if (g.onlyAdmins) out.push("Solo admins");
  if (g.forbidsAds) out.push("Prohíbe publicidad");
  return out;
}
