import { describe, expect, it } from "vitest";
import type { MarketplaceEntry } from "@nv/domain";

import { categoriesOf, filterApps, installedCount } from "./marketplace";

const app = (over: Partial<MarketplaceEntry> = {}): MarketplaceEntry => ({
  id: "x",
  name: "App",
  category: "General",
  tagline: "tag",
  description: "desc",
  features: [],
  hue: 200,
  installed: false,
  ...over,
});

const items: MarketplaceEntry[] = [
  app({ id: "surveys", name: "Encuestas", category: "Engagement", features: ["NPS"], installed: true }),
  app({ id: "chatbot", name: "Chatbot IA", category: "Automatización", tagline: "IA 24/7" }),
  app({ id: "landing", name: "Landing Pages", category: "Contenido", description: "sin código" }),
];

describe("filterApps", () => {
  it("filters by category", () => {
    expect(filterApps(items, { category: "Contenido" }).map((a) => a.id)).toEqual(["landing"]);
    expect(filterApps(items, { category: "" })).toHaveLength(3);
  });
  it("searches name/category/tagline/description/features", () => {
    expect(filterApps(items, { q: "encuestas" }).map((a) => a.id)).toEqual(["surveys"]);
    expect(filterApps(items, { q: "nps" }).map((a) => a.id)).toEqual(["surveys"]);
    expect(filterApps(items, { q: "24/7" }).map((a) => a.id)).toEqual(["chatbot"]);
    expect(filterApps(items, { q: "sin código" }).map((a) => a.id)).toEqual(["landing"]);
  });
  it("combines category and query", () => {
    expect(filterApps(items, { category: "Automatización", q: "ia" }).map((a) => a.id)).toEqual([
      "chatbot",
    ]);
    expect(filterApps(items, { category: "Engagement", q: "chatbot" })).toHaveLength(0);
  });
});

describe("categoriesOf", () => {
  it("returns distinct categories sorted", () => {
    expect(categoriesOf(items)).toEqual(["Automatización", "Contenido", "Engagement"]);
  });
});

describe("installedCount", () => {
  it("counts installed apps", () => {
    expect(installedCount(items)).toBe(1);
    expect(installedCount([])).toBe(0);
  });
});
