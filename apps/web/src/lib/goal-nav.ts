import { NAV_SECTIONS, WORKSPACE_GOALS } from "@nv/domain";

import { EXTRA_NAV_ITEMS, type NavRenderItem } from "@/components/shell/sidebar-icon";

export interface NavRenderSection {
  label: string;
  items: NavRenderItem[];
}

/** Every sidebar section with the web-only entries merged in. */
export function baseNavSections(): NavRenderSection[] {
  return NAV_SECTIONS.map((s) => ({
    label: s.label,
    items: [...s.items, ...(EXTRA_NAV_ITEMS[s.label] ?? [])],
  }));
}

/** Screens the brand's goals pin, in goal order, once each. */
export function goalModules(goals: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const id of goals ?? []) {
    for (const m of WORKSPACE_GOALS.find((g) => g.id === id)?.modules ?? [])
      if (!out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * The sidebar for a brand: with goals, a «TU OBJETIVO» section on top holds
 * the screens those goals need (Dashboard stays first), and they leave their
 * usual section. Without goals, the standard menu.
 */
export function navSectionsFor(goals: readonly string[] | undefined): NavRenderSection[] {
  const sections = baseNavSections();
  const pinned = goalModules(goals);
  if (pinned.length === 0) return sections;
  const byModule = new Map(sections.flatMap((s) => s.items).map((i) => [i.module, i]));
  const top = ["dashboard", ...pinned]
    .map((m) => byModule.get(m))
    .filter((i): i is NavRenderItem => Boolean(i));
  const taken = new Set(top.map((i) => i.module));
  return [
    { label: "TU OBJETIVO", items: top },
    ...sections
      .map((s) => ({ ...s, items: s.items.filter((i) => !taken.has(i.module)) }))
      .filter((s) => s.items.length > 0),
  ];
}
