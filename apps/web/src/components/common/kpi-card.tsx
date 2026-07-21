import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EMPTY_METRIC } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardProps {
  label: string;
  value?: string | null;
  delta?: string;
  deltaTrend?: "up" | "down" | "neutral";
  icon: LucideIcon;
  accent?: string;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaTrend = "neutral",
  icon: Icon,
  accent = "#5B8DEF",
  loading = false,
}: KpiCardProps) {
  return (
    <div className="nv-panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div
          className="grid size-9 place-items-center rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Icon className="size-4" />
        </div>
        {loading ? (
          <Skeleton className="h-5 w-14 rounded-full" />
        ) : delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              deltaTrend === "up" && "bg-state-success/15 text-state-success",
              deltaTrend === "down" && "bg-state-danger/15 text-state-danger",
              deltaTrend === "neutral" && "bg-line-strong/60 text-ink-muted",
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div>
        {loading ? (
          <Skeleton className="mb-1.5 h-7 w-16" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums text-ink-bright">
            {value ?? EMPTY_METRIC}
          </div>
        )}
        <div className="text-xs text-ink-muted">{label}</div>
      </div>
    </div>
  );
}
