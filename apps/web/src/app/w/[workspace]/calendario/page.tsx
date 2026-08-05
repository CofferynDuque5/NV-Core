import * as React from "react";
import type { ChannelId, Post } from "@nv/domain";
import { toast } from "sonner";

import { ymd, hm, rangeLabel, countByChannel, scheduledOnly, rescheduleISO, bestHours } from "@/lib/calendar";
import { useCalendar } from "@/hooks/use-calendar";
import { usePosts, useCampaigns } from "@/hooks/use-domain-data";
import { useMovePost } from "@/hooks/use-domain-mutations";
import { Panel } from "@/components/common/panel";
import { ErrorState } from "@/components/common/error-state";
import { PostScheduleDialog } from "@/components/entities/post-schedule-dialog";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { CalendarRail } from "@/components/calendar/calendar-rail";
import { PostPanel } from "@/components/calendar/post-panel";
import { CalendarDnDProvider } from "@/components/calendar/dnd-context";
import {
  MonthView,
  WeekView,
  DayView,
  TimelineView,
  AgendaView,
} from "@/components/calendar/calendar-views";

/** Should a single-key shortcut be ignored (typing / dialog open)? */
function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export default function CalendarioPage() {
  const cal = useCalendar();
  const posts = usePosts();
  const campaigns = useCampaigns();
  const move = useMovePost();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<{ date?: string; time?: string; channel?: ChannelId }>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const allItems = posts.data?.items ?? [];
  const allScheduled = React.useMemo(() => scheduledOnly(allItems), [allItems]);
  const selectedPost = React.useMemo<Post | undefined>(
    () => allItems.find((p) => p.id === selectedId),
    [allItems, selectedId],
  );

  const topChannel = React.useMemo<ChannelId | undefined>(() => {
    const entries = Object.entries(countByChannel(allItems)).sort((a, b) => b[1] - a[1]);
    return (entries[0]?.[0] as ChannelId) ?? undefined;
  }, [allItems]);

  const openCreate = React.useCallback(
    (day?: Date, time?: string) => {
      setPrefill({ date: day ? ymd(day) : undefined, time, channel: topChannel });
      setDialogOpen(true);
    },
    [topChannel],
  );

  const onSelect = React.useCallback((p: Post) => setSelectedId(p.id), []);

  // Best-time heuristic from the workspace's own history. When exactly one
  // channel is isolated, recommend for that channel; otherwise global.
  const recommendedHours = React.useMemo(() => {
    const soloChannel = cal.filters.channels.length === 1 ? cal.filters.channels[0] : undefined;
    return bestHours(allScheduled, soloChannel, 3);
  }, [allScheduled, cal.filters.channels]);

  // The single "move" primitive: drag & drop and the panel nudges both use it.
  // Optimistic (see useMovePost) + an "undo" toast that restores the old slot.
  const onMove = React.useCallback(
    (post: Post, day: Date, time?: string, channel?: ChannelId) => {
      if (!post.scheduledAt) return;
      const prevIso = post.scheduledAt;
      const prevChannel = post.channel;
      const scheduledAt = rescheduleISO(prevIso, day, time);
      const reChannel = channel && channel !== post.channel ? channel : undefined;
      if (scheduledAt === prevIso && !reChannel) return; // no-op

      move.mutate(
        { id: post.id, scheduledAt, channel: reChannel },
        {
          onSuccess: () =>
            toast("Publicación movida", {
              description: `${ymd(new Date(scheduledAt))} · ${hm(new Date(scheduledAt))}`,
              action: {
                label: "Deshacer",
                onClick: () =>
                  move.mutate({ id: post.id, scheduledAt: prevIso, channel: reChannel ? prevChannel : undefined }),
              },
            }),
        },
      );
    },
    [move],
  );

  // Keyboard shortcuts (ignored while typing or a dialog is open).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialogOpen || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "m") cal.setView("month");
      else if (k === "s") cal.setView("week");
      else if (k === "d") cal.setView("day");
      else if (k === "l") cal.setView("timeline");
      else if (k === "a") cal.setView("agenda");
      else if (k === "t") cal.goToday();
      else if (k === "n") openCreate(cal.cursor);
      else if (e.key === "Escape") setSelectedId(null);
      else if (e.key === "ArrowLeft") cal.prev();
      else if (e.key === "ArrowRight") cal.next();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cal, dialogOpen, openCreate]);

  const viewProps = {
    cursor: cal.cursor,
    byDay: cal.byDay,
    onCreate: openCreate,
    onSelect,
    selectedId: selectedId ?? undefined,
    recommendedHours,
  };

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={cal.view}
        onView={cal.setView}
        label={rangeLabel(cal.view, cal.cursor)}
        onPrev={cal.prev}
        onToday={cal.goToday}
        onNext={cal.next}
        onCreate={() => openCreate(cal.cursor)}
      />

      <CalendarDnDProvider onMove={onMove}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <Panel className="overflow-hidden">
            {cal.isError ? (
              <ErrorState onRetry={() => posts.refetch()} />
            ) : cal.isLoading ? (
              <div className="grid min-h-[420px] place-items-center text-ink-muted">
                <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
              </div>
            ) : cal.view === "month" ? (
              <MonthView {...viewProps} />
            ) : cal.view === "week" ? (
              <WeekView {...viewProps} />
            ) : cal.view === "day" ? (
              <DayView {...viewProps} />
            ) : cal.view === "timeline" ? (
              <TimelineView {...viewProps} />
            ) : (
              <AgendaView {...viewProps} />
            )}
          </Panel>

          {selectedPost ? (
            <PostPanel
              post={selectedPost}
              posts={allScheduled}
              onClose={() => setSelectedId(null)}
              onSelect={onSelect}
              onMove={onMove}
            />
          ) : (
            <CalendarRail
              filters={cal.filters}
              setFilters={cal.setFilters}
              visible={cal.visible}
              unscheduledCount={cal.unscheduledCount}
              campaigns={campaigns.data?.items ?? []}
            />
          )}
        </div>
      </CalendarDnDProvider>

      <PostScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={prefill.date}
        defaultTime={prefill.time}
        defaultChannel={prefill.channel}
      />
    </div>
  );
}
