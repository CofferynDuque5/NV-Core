import type { HelpArticle, HelpBlock } from "@nv/domain";

/**
 * Pure Help Center helpers — no React, unit-tested. Powers the search box and
 * category filter of the in-app help center. Search ranks title/tag matches
 * above body matches so the most relevant article surfaces first.
 */

export interface HelpFilter {
  q?: string;
  category?: string; // "" / undefined = all
}

/** Flatten an article's structured body into a single searchable string. */
function bodyText(blocks: HelpBlock[]): string {
  return blocks
    .map((b) => (b.type === "steps" ? b.items.join(" ") : b.text))
    .join(" ");
}

/** Relevance score for a query against an article (0 = no match). */
export function scoreArticle(article: HelpArticle, q: string): number {
  const needle = q.trim().toLowerCase();
  if (!needle) return 1;
  const title = article.title.toLowerCase();
  const tags = article.tags.join(" ").toLowerCase();
  const summary = article.summary.toLowerCase();
  if (title.includes(needle)) return 100;
  if (tags.includes(needle)) return 60;
  if (summary.includes(needle)) return 40;
  if (bodyText(article.body).toLowerCase().includes(needle)) return 20;
  return 0;
}

/**
 * Filter by (optional) category then free-text query, returning the matches
 * ordered by relevance. With no query, original catalog order is preserved.
 */
export function filterArticles(items: HelpArticle[], f: HelpFilter): HelpArticle[] {
  const cat = f.category?.trim();
  const q = f.q?.trim() ?? "";
  const inCat = cat ? items.filter((a) => a.category === cat) : items;
  if (!q) return inCat;
  return inCat
    .map((a) => ({ a, score: scoreArticle(a, q) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

/** Count of articles in a given category. */
export function countInCategory(items: HelpArticle[], categoryId: string): number {
  return items.filter((a) => a.category === categoryId).length;
}
