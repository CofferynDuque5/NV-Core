import * as React from "react";
import type { ChannelId, Post } from "@nv/domain";

import { cn } from "@/lib/utils";

interface DnDValue {
  dragging: Post | null;
  start: (post: Post) => void;
  end: () => void;
  drop: (day: Date, time?: string, channel?: ChannelId) => void;
}

const DnDContext = React.createContext<DnDValue | null>(null);

/**
 * Calendar drag & drop. One "move" primitive behind every input: dragging a
 * chip reports the drop target (day / time slot / channel lane) and the host
 * turns it into a reschedule. Native HTML5 DnD — no extra dependency.
 */
export function CalendarDnDProvider({
  onMove,
  children,
}: {
  onMove: (post: Post, day: Date, time?: string, channel?: ChannelId) => void;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = React.useState<Post | null>(null);

  const value = React.useMemo<DnDValue>(
    () => ({
      dragging,
      start: (post) => setDragging(post),
      end: () => setDragging(null),
      drop: (day, time, channel) => {
        setDragging((current) => {
          if (current) onMove(current, day, time, channel);
          return null;
        });
      },
    }),
    [dragging, onMove],
  );

  return <DnDContext.Provider value={value}>{children}</DnDContext.Provider>;
}

export function useCalendarDnD(): DnDValue | null {
  return React.useContext(DnDContext);
}

/**
 * A drop target. Highlights while a chip hovers (brand), or amber when the drop
 * would collide (`danger`) — the conflict is surfaced BEFORE the drop.
 */
export function DropZone({
  onDrop,
  danger = false,
  className,
  children,
}: {
  onDrop: () => void;
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const dnd = useCalendarDnD();
  const [over, setOver] = React.useState(false);
  const active = over && Boolean(dnd?.dragging);

  return (
    <div
      onDragOver={(e) => {
        if (!dnd?.dragging) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      className={cn(
        className,
        active && (danger ? "ring-2 ring-inset ring-state-warning" : "ring-2 ring-inset ring-brand"),
      )}
    >
      {children}
    </div>
  );
}
