import type { SendLogEntry } from "@nv/domain";

/** Channels shown in the Historial filter. */
export type HistorialChannel = "whatsapp" | "facebook" | "instagram" | "otro";
export type HistorialFilter = "all" | HistorialChannel;

/** Classify a send-log entry into a channel (WhatsApp group send vs FB/IG post). */
export function channelOf(entry: SendLogEntry): HistorialChannel {
  const t = (entry.target ?? "").toLowerCase();
  if (t === "facebook") return "facebook";
  if (t === "instagram") return "instagram";
  if (t === "wa" || t === "whatsapp" || entry.groupId || entry.groupName) return "whatsapp";
  return "otro";
}

/** Filter rows by channel; "all" returns everything. */
export function filterHistorial(rows: SendLogEntry[], channel: HistorialFilter): SendLogEntry[] {
  if (channel === "all") return rows;
  return rows.filter((r) => channelOf(r) === channel);
}

/** Counts of ok / error / total for a set of rows. */
export function summarize(rows: SendLogEntry[]): { total: number; ok: number; error: number } {
  let ok = 0;
  for (const r of rows) if (r.ok) ok++;
  return { total: rows.length, ok, error: rows.length - ok };
}

/** How many rows fall in each channel (for the tab counters). */
export function channelCounts(rows: SendLogEntry[]): Record<HistorialFilter, number> {
  const counts: Record<HistorialFilter, number> = {
    all: rows.length,
    whatsapp: 0,
    facebook: 0,
    instagram: 0,
    otro: 0,
  };
  for (const r of rows) counts[channelOf(r)]++;
  return counts;
}
