import { cn } from "@/lib/utils";

/**
 * 12-hour time picker with explicit AM/PM — clearer than the browser's native
 * <input type="time">, whose format depends on the OS locale (some show 24h with
 * no AM/PM). Value and onChange use 24h "HH:MM" so storage stays unambiguous.
 */
type Meridiem = "AM" | "PM";

const selectClass =
  "h-9 rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

function parse(value: string): { h12: number; m: number; mer: Meridiem } {
  const [hRaw, mRaw] = (value || "").split(":");
  let h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h)) h = 20; // default 8:00 PM
  const mer: Meridiem = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { h12, m: Number.isNaN(m) ? 0 : m, mer };
}

function to24(h12: number, m: number, mer: Meridiem): string {
  let h = h12 % 12;
  if (mer === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function TimePicker12h({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { h12, m, mer } = parse(value);
  const set = (next: Partial<{ h12: number; m: number; mer: Meridiem }>) =>
    onChange(to24(next.h12 ?? h12, next.m ?? m, next.mer ?? mer));

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  // 5-minute steps, plus the current minute if it isn't a multiple of 5.
  const minutes = Array.from(new Set([...Array.from({ length: 12 }, (_, i) => i * 5), m])).sort(
    (a, b) => a - b,
  );

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <select
        aria-label="Hora"
        className={selectClass}
        value={h12}
        onChange={(e) => set({ h12: Number(e.target.value) })}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-ink-faint">:</span>
      <select
        aria-label="Minutos"
        className={selectClass}
        value={m}
        onChange={(e) => set({ m: Number(e.target.value) })}
      >
        {minutes.map((mm) => (
          <option key={mm} value={mm}>
            {String(mm).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label="AM o PM"
        className={selectClass}
        value={mer}
        onChange={(e) => set({ mer: e.target.value as Meridiem })}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
