import { phoneKey } from "../consent/consent.service";

/** The contact fields a merge and the duplicate finder look at. */
export interface MergeableContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  stage: string;
  lastContactAt: Date | null;
  optOutAt: Date | null;
  optOutSource: string | null;
  consentAt: Date | null;
  consentSource: string | null;
  attribution: unknown;
  createdAt: Date;
}

const emailKey = (e: string | null | undefined) => (e ?? "").trim().toLowerCase() || null;
/** A «name» that is only a phone number (chats saved before WhatsApp told us the name). */
const isBareName = (n: string) => /^\+?[\d\s()-]{6,}$/.test(n.trim());

/**
 * Groups of contacts that are the same person: they share a phone (last 9
 * digits) or an email. Chained matches join (A~B by phone, B~C by email).
 * Biggest groups first; each group oldest contact first.
 */
export function findDuplicateGroups<T extends Pick<MergeableContact, "id" | "phone" | "email" | "createdAt">>(
  contacts: T[],
): T[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const c of contacts) parent.set(c.id, c.id);
  const firstBy = new Map<string, string>();
  for (const c of contacts) {
    for (const key of [phoneKey(c.phone) ? `p:${phoneKey(c.phone)}` : null, emailKey(c.email) ? `e:${emailKey(c.email)}` : null]) {
      if (!key) continue;
      const other = firstBy.get(key);
      if (other) parent.set(find(c.id), find(other));
      else firstBy.set(key, c.id);
    }
  }
  const groups = new Map<string, T[]>();
  for (const c of contacts) {
    const r = find(c.id);
    const list = groups.get(r) ?? [];
    list.push(c);
    groups.set(r, list);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
    .sort((a, b) => b.length - a.length || a[0]!.createdAt.getTime() - b[0]!.createdAt.getTime());
}

/**
 * What the kept contact looks like after absorbing the others: its own values
 * win, empty ones are filled from the others, tags are joined, and an opt-out
 * on any of them is kept (never message someone who asked not to be).
 */
export function mergeContactFields(keep: MergeableContact, others: MergeableContact[]) {
  const all = [keep, ...others];
  const first = <K extends keyof MergeableContact>(k: K) =>
    all.map((c) => c[k]).find((v) => v !== null && v !== undefined && v !== "") ?? null;
  const realName = isBareName(keep.name) ? (others.map((o) => o.name).find((n) => !isBareName(n)) ?? keep.name) : keep.name;
  const optedOut = all.filter((c) => c.optOutAt).sort((a, b) => a.optOutAt!.getTime() - b.optOutAt!.getTime())[0];
  const consented = all.filter((c) => c.consentAt).sort((a, b) => a.consentAt!.getTime() - b.consentAt!.getTime())[0];
  const last = all
    .map((c) => c.lastContactAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    name: realName,
    phone: first("phone") as string | null,
    email: first("email") as string | null,
    company: first("company") as string | null,
    tags: [...new Set(all.flatMap((c) => c.tags))],
    lastContactAt: last ?? null,
    optOutAt: optedOut?.optOutAt ?? null,
    optOutSource: optedOut?.optOutSource ?? null,
    consentAt: consented?.consentAt ?? null,
    consentSource: consented?.consentSource ?? null,
    attribution: first("attribution"),
  };
}
