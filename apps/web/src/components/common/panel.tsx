import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("nv-panel", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-5 py-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink-bright">{title}</h2>
        {description ? <p className="truncate text-xs text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
