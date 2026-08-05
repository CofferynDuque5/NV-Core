import { WEEKDAYS_ES, heatIntensity, heatmapMax } from "@/lib/analytics";

/**
 * Weekday × hour activity heatmap (message volume, UTC). Pure presentational:
 * intensity is scaled to the matrix peak so sparse workspaces still read well.
 */
export function ActivityHeatmap({ matrix }: { matrix: number[][] }) {
  const max = heatmapMax(matrix);
  // Hour ticks every 3h keep the axis legible on narrow screens.
  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <div className="overflow-x-auto p-4">
      <div className="min-w-[560px]">
        <div className="flex flex-col gap-1">
          {matrix.map((row, day) => (
            <div key={day} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-right text-[10px] text-ink-faint">
                {WEEKDAYS_ES[day]}
              </span>
              <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                {row.map((value, hour) => {
                  const t = heatIntensity(value, max);
                  return (
                    <div
                      key={hour}
                      title={`${WEEKDAYS_ES[day]} ${String(hour).padStart(2, "0")}:00 — ${value} mensajes`}
                      className="aspect-square rounded-[3px] border border-line/40"
                      style={{
                        background:
                          t === 0 ? "hsl(var(--panel-raised))" : `rgba(91, 141, 239, ${0.15 + t * 0.85})`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {/* Hour axis */}
          <div className="mt-1 flex items-center gap-1">
            <span className="w-8 shrink-0" />
            <div className="relative h-4 flex-1">
              {hourTicks.map((h) => (
                <span
                  key={h}
                  className="absolute text-[10px] text-ink-faint"
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
