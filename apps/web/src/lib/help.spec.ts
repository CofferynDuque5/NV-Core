import { describe, expect, it } from "vitest";
import { HELP_ARTICLES } from "@nv/domain";

import { countInCategory, filterArticles, scoreArticle } from "./help";

describe("help search", () => {
  it("ranks a title match above a body-only match", () => {
    const csv = HELP_ARTICLES.find((a) => a.slug === "importar-contactos-csv")!;
    const other = HELP_ARTICLES.find((a) => a.slug === "bienvenido-a-nv-core")!;
    expect(scoreArticle(csv, "importa")).toBeGreaterThan(scoreArticle(other, "importa"));
  });

  it("returns every article for an empty query, preserving order", () => {
    const res = filterArticles(HELP_ARTICLES, { q: "" });
    expect(res).toHaveLength(HELP_ARTICLES.length);
    expect(res[0]).toBe(HELP_ARTICLES[0]);
  });

  it("finds articles by tag", () => {
    const res = filterArticles(HELP_ARTICLES, { q: "whatsapp" });
    expect(res.some((a) => a.slug === "conectar-whatsapp")).toBe(true);
  });

  it("finds articles by body text", () => {
    const res = filterArticles(HELP_ARTICLES, { q: "punto y coma" });
    expect(res.some((a) => a.slug === "importar-contactos-csv")).toBe(true);
  });

  it("returns nothing for a query that matches no article", () => {
    expect(filterArticles(HELP_ARTICLES, { q: "zxqwvniet" })).toEqual([]);
  });

  it("filters by category before searching", () => {
    const res = filterArticles(HELP_ARTICLES, { category: "canales" });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((a) => a.category === "canales")).toBe(true);
  });

  it("combines category and query", () => {
    const res = filterArticles(HELP_ARTICLES, { category: "audiencia", q: "csv" });
    expect(res.every((a) => a.category === "audiencia")).toBe(true);
    expect(res.some((a) => a.slug === "importar-contactos-csv")).toBe(true);
  });

  it("counts articles per category", () => {
    const total = HELP_ARTICLES.length;
    const sum = ["primeros-pasos", "canales", "audiencia", "contenido", "automatizacion", "cuenta"]
      .map((c) => countInCategory(HELP_ARTICLES, c))
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(total);
  });
});
