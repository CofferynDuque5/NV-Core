import { describe, expect, it } from "vitest";
import type { Integration } from "@nv/domain";

import { categoriesOf, connectedCount, filterIntegrations } from "./integrations";

const items: Integration[] = [
  { id: "openai", name: "OpenAI", category: "IA", description: "GPT", connected: true },
  { id: "n8n", name: "n8n", category: "Automatización", description: "workflows", connected: false },
  { id: "meta", name: "Meta Graph", category: "Mensajería", description: "Facebook e Instagram", connected: false },
];

describe("integrations directory helpers", () => {
  it("categoriesOf returns distinct categories in order", () => {
    expect(categoriesOf(items)).toEqual(["IA", "Automatización", "Mensajería"]);
  });

  it("connectedCount counts only connected", () => {
    expect(connectedCount(items)).toBe(1);
  });

  it("filters by free text across name/description/category", () => {
    expect(filterIntegrations(items, "gpt").map((i) => i.id)).toEqual(["openai"]);
    expect(filterIntegrations(items, "instagram").map((i) => i.id)).toEqual(["meta"]);
    expect(filterIntegrations(items, "automat").map((i) => i.id)).toEqual(["n8n"]);
    expect(filterIntegrations(items, "").length).toBe(3);
  });

  it("filters by category, honoring 'all'", () => {
    expect(filterIntegrations(items, "", "Mensajería").map((i) => i.id)).toEqual(["meta"]);
    expect(filterIntegrations(items, "", "all").length).toBe(3);
  });
});
