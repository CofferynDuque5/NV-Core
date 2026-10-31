/**
 * Helpers of the global search (Ctrl+K): accent-free matching, the parts of a
 * text to highlight, and the viewer's recent searches and opened results,
 * kept per brand in this browser only.
 */

/** Lowercase without accents, so "campana" finds "Campañas". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every word of the search appears somewhere in the item. */
export function matches(value: string, search: string): boolean {
  const hay = fold(value);
  return fold(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/**
 * The text split into plain and matching parts, for <mark>. Matching ignores
 * accents and case but the parts keep the original spelling ("María").
 */
export function highlightParts(text: string, search: string): { text: string; hit: boolean }[] {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (!text || words.length === 0) return [{ text, hit: false }];
  // Fold one character at a time so positions line up with the original.
  const chars = [...text];
  const folded = chars.map((c) => fold(c));
  const flat = folded.join("");
  const starts: number[] = [];
  let pos = 0;
  for (const f of folded) {
    starts.push(pos);
    pos += f.length;
  }
  const hit = new Array<boolean>(chars.length).fill(false);
  for (const w of words) {
    let from = flat.indexOf(w);
    while (from !== -1) {
      const to = from + w.length;
      for (let i = 0; i < chars.length; i++) {
        const s = starts[i]!;
        if (s < to && s + folded[i]!.length > from) hit[i] = true;
      }
      from = flat.indexOf(w, to);
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.text += c;
    else out.push({ text: c, hit: hit[i]! });
  });
  return out;
}

/** A result the viewer opened, to offer it again («Abiertos hace poco»). */
export interface RecentItem {
  kind: "contact" | "conversation" | "campaign" | "group" | "product" | "page";
  id: string;
  title: string;
  subtitle?: string;
  path: string;
  at: number;
}

const MAX_QUERIES = 5;
const MAX_ITEMS = 4;

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage full: recents are only a convenience */
  }
}

const queriesKey = (ws: string) => `nv-search:${ws}:queries`;
const itemsKey = (ws: string) => `nv-search:${ws}:items`;

export function recentQueries(ws: string): string[] {
  return read<string>(queriesKey(ws))
    .filter((q) => typeof q === "string" && q.trim().length >= 2)
    .slice(0, MAX_QUERIES);
}

/** Newest first, no repeats (accent/case-insensitive), at most 5. */
export function pushRecentQuery(ws: string, q: string): string[] {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return recentQueries(ws);
  const next = [term, ...recentQueries(ws).filter((x) => fold(x) !== fold(term))].slice(
    0,
    MAX_QUERIES,
  );
  write(queriesKey(ws), next);
  return next;
}

export function removeRecentQuery(ws: string, q: string): string[] {
  const next = recentQueries(ws).filter((x) => x !== q);
  write(queriesKey(ws), next);
  return next;
}

export function recentItems(ws: string): RecentItem[] {
  return read<RecentItem>(itemsKey(ws))
    .filter(
      (i) =>
        i &&
        typeof i.id === "string" &&
        typeof i.title === "string" &&
        typeof i.path === "string" &&
        !/^[a-z]+:/i.test(i.path),
    )
    .slice(0, MAX_ITEMS);
}

export function pushRecentItem(
  ws: string,
  item: Omit<RecentItem, "at">,
  now = Date.now(),
): RecentItem[] {
  const next = [
    { ...item, at: now },
    ...recentItems(ws).filter((x) => !(x.kind === item.kind && x.id === item.id)),
  ].slice(0, MAX_ITEMS);
  write(itemsKey(ws), next);
  return next;
}

export function clearRecents(ws: string): void {
  write(queriesKey(ws), []);
  write(itemsKey(ws), []);
}
