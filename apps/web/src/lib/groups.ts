import type { Group } from "@nv/domain";

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
