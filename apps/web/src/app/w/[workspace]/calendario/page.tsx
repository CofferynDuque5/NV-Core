import * as React from "react";
import type { ChannelId, Post } from "@nv/domain";

import { ymd, rangeLabel, countByChannel, scheduledOnly } from "@/lib/calendar";
import { useCalendar } from "@/hooks/use-calendar";
import { usePosts, useCampaigns } from "@/hooks/use-domain-data";
import { Panel } from "@/components/common/panel";
import { ErrorState } from "@/components/common/error-state";
import { PostScheduleDialog } from "@/components/entities/post-schedule-dialog";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { CalendarRail } from "@/components/calendar/calendar-rail";
import { PostPanel } from "@/components/calendar/post-panel";
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

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<{ date?: string; time?: string; channel?: ChannelId }>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const allItems = posts.data?.items ?? [];
  // Conflicts/siblings consider ALL scheduled posts (not just the filtered set).
  const allScheduled = React.useMemo(() => scheduledOnly(allItems), [allItems]);
  const selectedPost = React.useMemo<Post | undefined>(
    () => allItems.find((p) => p.id === selectedId),
    [allItems, selectedId],
  );

  // Automation: preselect the workspace's most-used channel for new posts.
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
