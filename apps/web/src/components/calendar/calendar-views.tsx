import * as React from "react";
import type { Post } from "@nv/domain";

import { cn } from "@/lib/utils";
import { monthMatrix, sameDay, weekDays, WEEKDAYS_ES, ymd } from "@/lib/calendar";
import { PostChip } from "./post-chip";

/** Time grid range (06:00–23:00) — the productive window for scheduling. */
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

interface ViewProps {
  cursor: Date;
  byDay: Map<string, Post[]>;
  /** Open the composer prefilled for this day (and optional HH:MM slot). */
  onCreate: (day: Date, time?: string) => void;
}

function postsByHour(posts: Post[]): Map<number, Post[]> {
  const m = new Map<number, Post[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const h = new Date(p.scheduledAt).getHours();
    const arr = m.get(h) ?? [];
    arr.push(p);
    m.set(h, arr);
  }
  return m;
}

// ── Month ────────────────────────────────────────────────────────────────────
export function MonthView({ cursor, byDay, onCreate }: ViewProps) {
  const cells = React.useMemo(() => monthMatrix(cursor), [cursor]);
  const today = new Date();
  const MAX = 3;

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS_ES.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const dayPosts = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={cn(
                "relative flex min-h-[104px] flex-col border-b border-r border-line-soft p-1",
                !inMonth && "bg-panel-sunken/40",
              )}
            >
              {/* Click-anywhere-to-create layer (behind chips). */}
              <button
                aria-label={`Programar el ${d.getDate()}`}
                onClick={() => onCreate(d)}
                className="absolute inset-0 z-0 transition-colors hover:bg-panel-raised/40"
              />
              <div className="pointer-events-none relative z-10 mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded text-[11px]",
                    isToday ? "bg-brand font-bold text-white" : inMonth ? "text-ink-muted" : "text-ink-faint",
                  )}
                >
                  {d.getDate()}
                </span>
                {dayPosts.length > 0 ? (
                  <span className="text-[10px] tabular-nums text-ink-faint">{dayPosts.length}</span>
                ) : null}
              </div>
              <div className="relative z-10 flex flex-col gap-0.5">
                {dayPosts.slice(0, MAX).map((p) => (
                  <div key={p.id} className="pointer-events-auto">
                    <PostChip post={p} compact />
                  </div>
                ))}
                {dayPosts.length > MAX ? (
                  <span className="pointer-events-none pl-1 text-[10px] text-ink-faint">
                    +{dayPosts.length - MAX} más
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared time grid (week / day) ────────────────────────────────────────────
function TimeGrid({ days, byDay, onCreate }: { days: Date[] } & Omit<ViewProps, "cursor">) {
  const today = new Date();
  const nowHour = today.getHours();

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        {/* Header row */}
        <div className="sticky top-0 z-10 border-b border-line bg-panel" />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={ymd(d)}
              className="sticky top-0 z-10 border-b border-l border-line bg-panel px-2 py-1.5 text-center"
            >
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                {WEEKDAYS_ES[(d.getDay() + 6) % 7]}
              </div>
              <div
                className={cn(
                  "mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-xs",
                  isToday ? "bg-brand font-bold text-white" : "text-ink",
                )}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}

        {/* Hour rows */}
        {HOURS.map((h) => (
          <React.Fragment key={h}>
            <div className="border-r border-line-soft py-1 pr-2 text-right text-[10px] tabular-nums text-ink-faint">
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d) => {
              const dayPosts = byDay.get(ymd(d)) ?? [];
              const hourPosts = postsByHour(dayPosts).get(h) ?? [];
              const isNow = sameDay(d, today) && h === nowHour;
              return (
                <div
                  key={`${ymd(d)}-${h}`}
                  className={cn(
                    "relative min-h-[52px] border-b border-l border-line-soft p-1",
                    isNow && "bg-brand/5",
                  )}
                >
                  <button
                    aria-label={`Programar ${String(h).padStart(2, "0")}:00`}
                    onClick={() => onCreate(d, `${String(h).padStart(2, "0")}:00`)}
                    className="absolute inset-0 z-0 transition-colors hover:bg-panel-raised/50"
                  />
                  {isNow ? <span className="absolute left-0 right-0 top-0 z-10 h-px bg-brand" /> : null}
                  <div className="relative z-10 flex flex-col gap-0.5">
                    {hourPosts.map((p) => (
                      <PostChip key={p.id} post={p} />
                    ))}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function WeekView({ cursor, byDay, onCreate }: ViewProps) {
  const days = React.useMemo(() => weekDays(cursor), [cursor]);
  return <TimeGrid days={days} byDay={byDay} onCreate={onCreate} />;
}

export function DayView({ cursor, byDay, onCreate }: ViewProps) {
  return <TimeGrid days={[cursor]} byDay={byDay} onCreate={onCreate} />;
}
