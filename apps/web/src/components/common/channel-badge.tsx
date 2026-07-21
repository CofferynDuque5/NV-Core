import { CHANNELS, type ChannelId } from "@nv/domain";

import { cn } from "@/lib/utils";

/** Small colored square with the channel monogram. */
export function ChannelChip({ id, className }: { id: ChannelId; className?: string }) {
  const ch = CHANNELS[id];
  return (
    <span
      title={ch.name}
      className={cn(
        "inline-grid size-5 place-items-center rounded-[6px] text-[9px] font-bold text-white",
        className,
      )}
      style={{ background: ch.color, color: id === "x" || id === "th" ? "#0B0D10" : "#fff" }}
    >
      {ch.name.slice(0, 1)}
    </span>
  );
}

/** Row of overlapping channel chips. */
export function ChannelStack({ ids }: { ids: ChannelId[] }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {ids.map((id) => (
        <span key={id} className="ring-2 ring-panel">
          <ChannelChip id={id} />
        </span>
      ))}
    </span>
  );
}

export function ChannelDot({ id }: { id: ChannelId }) {
  const ch = CHANNELS[id];
  return <span className="size-2 rounded-full" style={{ background: ch.color }} />;
}
