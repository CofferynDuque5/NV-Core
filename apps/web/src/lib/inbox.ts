import type { Conversation } from "@nv/domain";

/**
 * Pure Inbox triage helpers — no React, unit-tested. Filtering runs client-side
 * over the loaded conversation list.
 */

export type InboxStatus = "open" | "resolved" | "all";

/** Sentinel assignee filter value meaning "unassigned". */
export const UNASSIGNED = "__none__";

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
