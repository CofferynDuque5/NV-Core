import { INBOX_UNASSIGNED, type Conversation } from "@nv/domain";

/**
 * Pure Inbox triage helpers — no React, unit-tested. The Inbox page searches and
 * filters on the server; `filterConversations` mirrors those rules for local lists.
 */

export type InboxStatus = "open" | "resolved" | "all";

/** Sentinel assignee filter value meaning "unassigned". */
export const UNASSIGNED = INBOX_UNASSIGNED;

export interface InboxFilter {
  q?: string;
  channel?: string; // "" = any
  status?: InboxStatus;
  assignee?: string; // "" = any, UNASSIGNED = only unassigned, else exact email
}

export function filterConversations(items: Conversation[], f: InboxFilter): Conversation[] {
  const q = f.q?.trim().toLowerCase();
  return items.filter((c) => {
    if (f.status === "open" && c.resolved) return false;
    if (f.status === "resolved" && !c.resolved) return false;
    if (f.channel && c.channel !== f.channel) return false;
    if (f.assignee === UNASSIGNED && c.assignee) return false;
    if (f.assignee && f.assignee !== UNASSIGNED && c.assignee !== f.assignee) return false;
    if (q) {
      const inName = c.contactName.toLowerCase().includes(q);
      const inLabels = (c.labels ?? []).some((l) => l.toLowerCase().includes(q));
      if (!inName && !inLabels) return false;
    }
    return true;
  });
}

/** Distinct labels used across conversations, sorted. */
export function allLabels(items: Conversation[]): string[] {
  const set = new Set<string>();
  for (const c of items) for (const l of c.labels ?? []) set.add(l);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Count of open (unresolved) conversations. */
export function openCount(items: Conversation[]): number {
  return items.filter((c) => !c.resolved).length;
}

/** Add a label to a conversation's list (no duplicates, trimmed). */
export function withLabel(labels: string[] | undefined, label: string): string[] {
  const clean = label.trim();
  const cur = labels ?? [];
  if (!clean || cur.includes(clean)) return cur;
  return [...cur, clean];
}

/** Remove a label from a conversation's list. */
export function withoutLabel(labels: string[] | undefined, label: string): string[] {
  return (labels ?? []).filter((l) => l !== label);
}

/** A chat waiting this long for an answer is shown in red. */
export const WAIT_LATE_MIN = 60;

/**
 * How long a chat has been waiting for an answer: «5 min», «2 h», «3 d».
 * `late` once it passes WAIT_LATE_MIN minutes.
 */
export function waitInfo(since: string | undefined, now = Date.now()): { label: string; late: boolean } | null {
  if (!since) return null;
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  const label = min < 1 ? "ahora" : min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d`;
  return { label, late: min >= WAIT_LATE_MIN };
}
