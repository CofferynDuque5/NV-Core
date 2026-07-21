import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * The single, canonical empty state used across every screen. It never invents
 * data — it invites the user to create the first record.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-panel/40 text-center",
        compact ? "gap-2 px-6 py-8" : "gap-3 px-6 py-16",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-xl bg-panel-raised text-ink-muted ring-1 ring-line">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-bright">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
