import * as React from "react";
import { CHANNEL_LIST, CHANNELS, type Post } from "@nv/domain";

import { cn } from "@/lib/utils";
import {
  agendaDays,
  MONTHS_ES,
  monthMatrix,
  sameDay,
  weekDays,
  WEEKDAYS_ES,
  ymd,
} from "@/lib/calendar";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Sparkles } from "lucide-react";
import { PostChip } from "./post-chip";
import { DropZone, useCalendarDnD } from "./dnd-context";

/** Time grid range (06:00–23:00) — the productive window for scheduling. */
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

interface ViewProps {
  cursor: Date;
  byDay: Map<string, Post[]>;
  /** Open the composer prefilled for this day (and optional HH:MM slot). */
  onCreate: (day: Date, time?: string) => void;
  /** Select a post → opens the side panel. */
  onSelect?: (post: Post) => void;
  /** Currently selected post id (highlight). */
  selectedId?: string;
  /** Hours recommended by the best-time heuristic (marked with a spark). */
  recommendedHours?: number[];
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
export function MonthView({ cursor, byDay, onCreate, onSelect, selectedId }: ViewProps) {
  const cells = React.useMemo(() => monthMatrix(cursor), [cursor]);
  const dnd = useCalendarDnD();
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
          const drag = dnd?.dragging;
          const danger = Boolean(drag && dayPosts.some((p) => p.id !== drag.id && p.channel === drag.channel));
          return (
            <DropZone
              key={key}
              onDrop={() => dnd?.drop(d)}
              danger={danger}
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
                    <PostChip post={p} compact onSelect={onSelect} selected={p.id === selectedId} />
                  </div>
                ))}
                {dayPosts.length > MAX ? (
                  <span className="pointer-events-none pl-1 text-[10px] text-ink-faint">
                    +{dayPosts.length - MAX} más
                  </span>
                ) : null}
              </div>
            </DropZone>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared time grid (week / day) ────────────────────────────────────────────
function TimeGrid({
  days,
  byDay,
  onCreate,
  onSelect,
  selectedId,
  recommendedHours = [],
}: { days: Date[] } & Omit<ViewProps, "cursor">) {
  const dnd = useCalendarDnD();
  const today = new Date();
  const nowHour = today.getHours();
  const recommended = new Set(recommendedHours);

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
            <div className="flex items-center justify-end gap-1 border-r border-line-soft py-1 pr-2 text-right text-[10px] tabular-nums text-ink-faint">
              {recommended.has(h) ? (
                <Sparkles className="size-3 text-brand-violet" aria-label="Mejor horario" />
              ) : null}
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d) => {
              const dayPosts = byDay.get(ymd(d)) ?? [];
              const hourPosts = postsByHour(dayPosts).get(h) ?? [];
              const isNow = sameDay(d, today) && h === nowHour;
              const drag = dnd?.dragging;
              const danger = Boolean(drag && hourPosts.some((p) => p.id !== drag.id && p.channel === drag.channel));
              const slot = `${String(h).padStart(2, "0")}:00`;
              return (
                <DropZone
                  key={`${ymd(d)}-${h}`}
                  onDrop={() => dnd?.drop(d, slot)}
                  danger={danger}
                  className={cn(
                    "relative min-h-[52px] border-b border-l border-line-soft p-1",
                    isNow && "bg-brand/5",
                  )}
                >
                  <button
                    aria-label={`Programar ${slot}`}
                    onClick={() => onCreate(d, slot)}
                    className="absolute inset-0 z-0 transition-colors hover:bg-panel-raised/50"
                  />
                  {isNow ? <span className="absolute left-0 right-0 top-0 z-10 h-px bg-brand" /> : null}
                  <div className="relative z-10 flex flex-col gap-0.5">
                    {hourPosts.map((p) => (
                      <PostChip key={p.id} post={p} onSelect={onSelect} selected={p.id === selectedId} />
                    ))}
                  </div>
                </DropZone>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function WeekView({ cursor, byDay, onCreate, onSelect, selectedId, recommendedHours }: ViewProps) {
  const days = React.useMemo(() => weekDays(cursor), [cursor]);
  return (
    <TimeGrid
      days={days}
      byDay={byDay}
      onCreate={onCreate}
      onSelect={onSelect}
      selectedId={selectedId}
      recommendedHours={recommendedHours}
    />
  );
}

export function DayView({ cursor, byDay, onCreate, onSelect, selectedId, recommendedHours }: ViewProps) {
  return (
    <TimeGrid
      days={[cursor]}
      byDay={byDay}
      onCreate={onCreate}
      onSelect={onSelect}
      selectedId={selectedId}
      recommendedHours={recommendedHours}
    />
  );
}

// ── Timeline (per-channel swimlanes across the week) ─────────────────────────
export function TimelineView({ cursor, byDay, onCreate, onSelect, selectedId }: ViewProps) {
  const days = React.useMemo(() => weekDays(cursor), [cursor]);
  const dnd = useCalendarDnD();
  const today = new Date();

  // Only show channels that actually have posts this week (keeps it dense).
  const activeChannels = React.useMemo(() => {
    const used = new Set<string>();
    for (const d of days) for (const p of byDay.get(ymd(d)) ?? []) used.add(p.channel);
    return CHANNEL_LIST.filter((c) => used.has(c.id));
  }, [days, byDay]);

  if (activeChannels.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={CalendarPlus}
          title="Sin publicaciones esta semana"
          description="Cambia de semana o programa contenido para verlo por canal."
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `120px repeat(7, 1fr)` }}>
        <div className="sticky left-0 z-10 border-b border-line bg-panel" />
        {days.map((d) => (
          <div
            key={ymd(d)}
            className="border-b border-l border-line bg-panel px-2 py-1.5 text-center text-[10px] uppercase tracking-wide text-ink-faint"
          >
            {WEEKDAYS_ES[(d.getDay() + 6) % 7]} {d.getDate()}
          </div>
        ))}

        {activeChannels.map((ch) => (
          <React.Fragment key={ch.id}>
            <div className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-line-soft bg-panel px-2.5 py-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
              <span className="truncate text-xs font-medium text-ink">{ch.name}</span>
            </div>
            {days.map((d) => {
              const cellPosts = (byDay.get(ymd(d)) ?? []).filter((p) => p.channel === ch.id);
              const isToday = sameDay(d, today);
              const drag = dnd?.dragging;
              // Dropping onto another channel's lane re-channels the post.
              const danger = Boolean(drag && cellPosts.some((p) => p.id !== drag.id));
              return (
                <DropZone
                  key={`${ch.id}-${ymd(d)}`}
                  onDrop={() => dnd?.drop(d, undefined, ch.id)}
                  danger={danger}
                  className={cn(
                    "relative min-h-[56px] border-b border-l border-line-soft p-1",
                    isToday && "bg-brand/5",
                  )}
                >
                  <button
                    aria-label={`Programar ${ch.name}`}
                    onClick={() => onCreate(d)}
                    className="absolute inset-0 z-0 transition-colors hover:bg-panel-raised/50"
                  />
                  <div className="relative z-10 flex flex-col gap-0.5">
                    {cellPosts.map((p) => (
                      <PostChip key={p.id} post={p} onSelect={onSelect} selected={p.id === selectedId} />
                    ))}
                  </div>
                </DropZone>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Agenda (chronological list, the fastest "what's next" scan) ──────────────
export function AgendaView({ cursor, byDay, onCreate, onSelect, selectedId }: ViewProps) {
  const days = React.useMemo(() => agendaDays(cursor, 14), [cursor]);
  const today = new Date();
  const withPosts = days.filter((d) => (byDay.get(ymd(d)) ?? []).length > 0);

  if (withPosts.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={CalendarPlus}
          title="Nada programado en estas dos semanas"
          description="Programa una publicación para empezar a llenar tu agenda."
          action={
            <Button size="sm" onClick={() => onCreate(cursor)}>
              Programar
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-line-soft">
      {withPosts.map((d) => {
        const dayPosts = byDay.get(ymd(d)) ?? [];
        const isToday = sameDay(d, today);
        return (
          <div key={ymd(d)} className="flex gap-3 px-4 py-3">
            <div className="w-20 shrink-0 pt-0.5">
              <div className={cn("text-sm font-semibold", isToday ? "text-brand" : "text-ink-bright")}>
                {isToday ? "Hoy" : `${WEEKDAYS_ES[(d.getDay() + 6) % 7]} ${d.getDate()}`}
              </div>
              <div className="text-[11px] text-ink-faint">{(MONTHS_ES[d.getMonth()] ?? "").slice(0, 3)}</div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {dayPosts.map((p) => {
                const ch = CHANNELS[p.channel];
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect?.(p)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                      p.id === selectedId
                        ? "border-brand bg-brand/5"
                        : "border-line-soft bg-panel hover:border-line-bright",
                    )}
                  >
                    <span className="w-10 shrink-0 text-xs tabular-nums text-ink-muted">
                      {p.scheduledAt ? new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: ch.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-faint">{ch.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
