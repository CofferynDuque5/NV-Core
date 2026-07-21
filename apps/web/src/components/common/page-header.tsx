import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-bright">
          {title}
        </h1>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
