import type { Integration } from "@nv/domain";

/** Pure helpers for the integrations directory (search + category filter). */

/** Distinct categories present in the catalog, in first-seen order. */
export function categoriesOf(items: Integration[]): string[] {
  const seen: string[] = [];
  for (const i of items) if (!seen.includes(i.category)) seen.push(i.category);
  return seen;
}

/** How many integrations are actually connected (configured). */
export function connectedCount(items: Integration[]): number {
  return items.filter((i) => i.connected).length;
}

/**
 * Filter by free-text (name/description/category) and an optional category.
 * `category` of "all"/undefined means no category filter.
 */
export function filterIntegrations(
  items: Integration[],
  q: string,
  category?: string,
): Integration[] {
  const needle = q.trim().toLowerCase();
  return items.filter((i) => {
    if (category && category !== "all" && i.category !== category) return false;
    if (!needle) return true;
    return (
      i.name.toLowerCase().includes(needle) ||
      i.description.toLowerCase().includes(needle) ||
      i.category.toLowerCase().includes(needle)
    );
  });
}
