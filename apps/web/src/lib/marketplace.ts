import type { MarketplaceEntry } from "@nv/domain";

/**
 * Pure Marketplace helpers — no React, unit-tested. Powers the catalog search,
 * category chips and the installed counter on the marketplace page.
 */

export interface MarketplaceFilter {
  q?: string;
  category?: string; // "" / undefined = all
}

/** Filter the catalog by free-text query and (optionally) a single category. */
export function filterApps(items: MarketplaceEntry[], f: MarketplaceFilter): MarketplaceEntry[] {
  const q = f.q?.trim().toLowerCase();
  const cat = f.category?.trim();
  return items.filter((a) => {
    if (cat && a.category !== cat) return false;
    if (q) {
      const hay = [a.name, a.category, a.tagline, a.description, ...a.features]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct categories present in the catalog, alphabetically sorted. */
export function categoriesOf(items: MarketplaceEntry[]): string[] {
  return Array.from(new Set(items.map((a) => a.category))).sort((a, b) => a.localeCompare(b));
}

/** How many apps are currently installed. */
export function installedCount(items: MarketplaceEntry[]): number {
  return items.filter((a) => a.installed).length;
}
