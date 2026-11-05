import { REPORT_TIME_ZONES, reportTimeZoneLabel } from "@nv/domain";

import { useWeeklyReportSettings } from "@/hooks/use-domain-data";
import { useUpdateWeeklyReportSettings } from "@/hooks/use-domain-mutations";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

/** Zones offered in the picker («UTC» is only the never-chosen default, not a choice). */
const CHOICES = REPORT_TIME_ZONES.filter((z) => z.id !== "UTC");

/**
 * The brand's time zone: daily/weekly campaign hours and the weekly report
 * follow it. Owner/Admin can change it here; everyone else just sees it.
 */
export function BrandTimeZone({
  className,
  id = "brand-zone",
}: {
  className?: string;
  id?: string;
}) {
  const settings = useWeeklyReportSettings();
  const save = useUpdateWeeklyReportSettings();
  const ws = useWorkspace();
  const role = useAuthStore((s) => s.memberships.find((m) => m.workspaceSlug === ws.slug)?.role);
  const canEdit = role === "Owner" || role === "Admin";
  const zone = settings.data?.timeZone;

  if (!canEdit) {
    return (
      <p className={cn("text-ink-faint text-[11px]", className)} data-testid="brand-zone">
        Hora de {zone ? reportTimeZoneLabel(zone) : "tu marca"}.
      </p>
    );
  }
  return (
    <div
      className={cn("text-ink-faint flex flex-wrap items-center gap-2 text-[11px]", className)}
      data-testid="brand-zone"
    >
      <label htmlFor={id}>Hora de la marca:</label>
      <select
        id={id}
        className="border-line-soft bg-panel-raised text-ink h-7 rounded-md border px-2 text-xs"
        value={zone ?? ""}
        onChange={(e) => save.mutate({ timeZone: e.target.value })}
        disabled={!settings.isSuccess || save.isPending}
        title="Las horas de las campañas y el informe semanal usan esta zona"
      >
        {CHOICES.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
      </select>
    </div>
  );
}
