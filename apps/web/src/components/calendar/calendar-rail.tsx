import type { Campaign, ChannelId, Post, PostStatus } from "@nv/domain";
import { CHANNEL_LIST } from "@nv/domain";
import { CalendarClock, FileText, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { countByChannel, filtersActive, type CalendarFilters } from "@/lib/calendar";
import { Panel, PanelHeader } from "@/components/common/panel";

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  publishing: "Publicando",
  sent: "Enviada",
  error: "Error",
};
const STATUSES: PostStatus[] = ["scheduled", "draft", "sent", "error"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Right rail: the answers the planner needs in <3s (how much is scheduled,
 * per channel, how many loose drafts) plus the filters that double as the
 * legend and as per-provider isolation (solo a channel, or keep all = global).
 */
export function CalendarRail({
  filters,
  setFilters,
  visible,
  unscheduledCount,
  campaigns,
}: {
  filters: CalendarFilters;
  setFilters: (f: CalendarFilters) => void;
  visible: Post[];
  unscheduledCount: number;
  campaigns: Campaign[];
}) {
  const perChannel = countByChannel(visible);
  const active = filtersActive(filters);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Resumen"
          action={
            active > 0 ? (
              <button
                onClick={() => setFilters({ channels: [], statuses: [], campaignId: null })}
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-brand"
              >
                <X className="size-3" /> Limpiar ({active})
              </button>
            ) : null
          }
        />
        <div className="grid grid-cols-2 gap-2 p-3">
          <Stat icon={<CalendarClock className="size-4 text-brand" />} value={visible.length} label="En vista" />
          <Stat icon={<FileText className="size-4 text-ink-muted" />} value={unscheduledCount} label="Sin fecha" />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Canales" />
        <ul className="p-2">
          {CHANNEL_LIST.map((ch) => {
            const on = filters.channels.length === 0 || filters.channels.includes(ch.id);
            const isSolo = filters.channels.length > 0 && filters.channels.includes(ch.id);
            return (
              <li key={ch.id}>
                <button
                  onClick={() => setFilters({ ...filters, channels: toggle<ChannelId>(filters.channels, ch.id) })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-panel-raised",
                    isSolo && "bg-panel-raised",
                    !on && "opacity-40",
                  )}
                  title={isSolo ? "Quitar del filtro" : "Aislar este canal"}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
                  <span className="flex-1 text-ink">{ch.name}</span>
                  <span className="tabular-nums text-ink-faint">{perChannel[ch.id] ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Estado" />
        <div className="flex flex-wrap gap-1.5 p-3">
          {STATUSES.map((s) => {
            const on = filters.statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => setFilters({ ...filters, statuses: toggle<PostStatus>(filters.statuses, s) })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  on
                    ? "border-brand/50 bg-brand/10 text-ink-bright"
                    : "border-line-soft text-ink-muted hover:border-line-bright",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      </Panel>

      {campaigns.length > 0 ? (
        <Panel>
          <PanelHeader title="Campaña" />
          <div className="p-3">
            <select
              value={filters.campaignId ?? ""}
              onChange={(e) => setFilters({ ...filters, campaignId: e.target.value || null })}
              className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            >
              <option value="">Todas las campañas</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel-raised p-2.5">
      <div className="flex items-center gap-1.5">{icon}<span className="text-lg font-semibold tabular-nums text-ink-bright">{value}</span></div>
      <div className="mt-0.5 text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}
