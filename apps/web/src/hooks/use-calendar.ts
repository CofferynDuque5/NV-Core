import * as React from "react";
import type { Post } from "@nv/domain";

import { usePosts } from "@/hooks/use-domain-data";
import {
  applyFilters,
  groupByDay,
  scheduledOnly,
  step,
  EMPTY_FILTERS,
  type CalendarFilters,
  type CalendarView,
} from "@/lib/calendar";

const VIEW_KEY = "nv-calendar-view";
const FILTERS_KEY = "nv-calendar-filters";

function readView(): CalendarView {
  if (typeof window === "undefined") return "week";
  const v = window.localStorage.getItem(VIEW_KEY);
  return v === "month" || v === "week" || v === "day" ? v : "week";
}

function readFilters(): CalendarFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<CalendarFilters>;
    return {
      channels: parsed.channels ?? [],
      statuses: parsed.statuses ?? [],
      campaignId: parsed.campaignId ?? null,
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export interface UseCalendar {
  view: CalendarView;
  setView: (v: CalendarView) => void;
  cursor: Date;
  setCursor: (d: Date) => void;
  goToday: () => void;
  prev: () => void;
  next: () => void;
  filters: CalendarFilters;
  setFilters: (f: CalendarFilters) => void;
  /** Scheduled posts after filters, ready to render. */
  visible: Post[];
  byDay: Map<string, Post[]>;
  /** Drafts without a date (not on the grid) — surfaced in the rail. */
  unscheduledCount: number;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Single source of truth for the Smart Calendar screen: view/cursor/filters
 * (persisted so the tool remembers how you work) derived over the existing
 * posts query. No new data layer — reuses usePosts + the S1 mutations.
 */
export function useCalendar(): UseCalendar {
  const posts = usePosts();
  const [view, setViewState] = React.useState<CalendarView>(readView);
  const [cursor, setCursor] = React.useState<Date>(() => new Date());
  const [filters, setFiltersState] = React.useState<CalendarFilters>(readFilters);

  const setView = React.useCallback((v: CalendarView) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setFilters = React.useCallback((f: CalendarFilters) => {
    setFiltersState(f);
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
    } catch {
      /* ignore */
    }
  }, []);

  const goToday = React.useCallback(() => setCursor(new Date()), []);
  const prev = React.useCallback(() => setCursor((c) => step(view, c, -1)), [view]);
  const next = React.useCallback(() => setCursor((c) => step(view, c, 1)), [view]);

  const items = posts.data?.items ?? [];

  const visible = React.useMemo(
    () => applyFilters(scheduledOnly(items), filters),
    [items, filters],
  );
  const byDay = React.useMemo(() => groupByDay(visible), [visible]);
  const unscheduledCount = React.useMemo(
    () => items.filter((p) => !p.scheduledAt).length,
    [items],
  );

  return {
    view,
    setView,
    cursor,
    setCursor,
    goToday,
    prev,
    next,
    filters,
    setFilters,
    visible,
    byDay,
    unscheduledCount,
    isLoading: posts.isLoading,
    isError: posts.isError,
  };
}
