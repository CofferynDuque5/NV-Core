/** One campaign run of the day: what went out, from when to when. */
export interface ActivityRun {
  campaignId: string | null;
  campaignName: string;
  /** First and last send of the run (ISO). */
  startedAt: string;
  endedAt: string;
  sent: number;
  failed: number;
  /** Where it went: "wa", "facebook", "instagram", "telegram"… */
  targets: string[];
}

/** What happened in a brand during a day (dashboard «Lo que pasó hoy»). */
export interface DayActivity {
  since: string;
  runs: ActivityRun[];
  inbox: { received: number; replied: number; newChats: number };
}

export interface ActivityLogRow {
  campaignId: string | null;
  campaignName: string | null;
  runKey: string | null;
  target: string | null;
  ok: boolean;
  createdAt: Date | string;
}

/** Send logs → one entry per campaign run, newest first. */
export function summarizeRuns(rows: ActivityLogRow[]): ActivityRun[] {
  const runs = new Map<string, ActivityRun & { start: number; end: number }>();
  for (const r of rows) {
    const at = new Date(r.createdAt).getTime();
    const key = `${r.campaignId ?? r.campaignName ?? "?"}|${r.runKey ?? ""}`;
    let run = runs.get(key);
    if (!run) {
      run = {
        campaignId: r.campaignId,
        campaignName: r.campaignName ?? "Campaña sin nombre",
        startedAt: "",
        endedAt: "",
        sent: 0,
        failed: 0,
        targets: [],
        start: at,
        end: at,
      };
      runs.set(key, run);
    }
    run.start = Math.min(run.start, at);
    run.end = Math.max(run.end, at);
    if (r.ok) run.sent += 1;
    else run.failed += 1;
    const target = r.target ?? "wa";
    if (!run.targets.includes(target)) run.targets.push(target);
  }
  return [...runs.values()]
    .sort((a, b) => b.start - a.start)
    .map(({ start, end, ...run }) => ({
      ...run,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
    }));
}
