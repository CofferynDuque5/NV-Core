import { CHANNELS, type Post } from "@nv/domain";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { hm } from "@/lib/calendar";
import { useDeletePost, useDuplicatePost } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { useCalendarDnD } from "./dnd-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_RING: Record<Post["status"], string> = {
  draft: "ring-line-strong",
  scheduled: "ring-brand/50",
  publishing: "ring-brand/50",
  sent: "ring-state-success/50",
  error: "ring-state-danger/60",
};

/**
 * A single publication on the calendar. Body click SELECTS it (opens the side
 * panel — the operational hub); the kebab exposes one-click quick actions
 * (duplicate / delete) so 50×/day tweaks never need a modal. Colored + labeled
 * by channel (never color-only, for a11y).
 */
export function PostChip({
  post,
  compact = false,
  selected = false,
  onSelect,
}: {
  post: Post;
  compact?: boolean;
  selected?: boolean;
  onSelect?: (post: Post) => void;
}) {
  const channel = CHANNELS[post.channel];
  const duplicate = useDuplicatePost();
  const del = useDeletePost();
  const confirm = useConfirm();
  const dnd = useCalendarDnD();
  const time = post.scheduledAt ? hm(new Date(post.scheduledAt)) : "";
  // Sent / publishing posts can't be rescheduled, so they're not draggable.
  const movable = post.status !== "sent" && post.status !== "publishing";

  async function onDelete() {
    const ok = await confirm({
      title: "Eliminar publicación",
      description: `Se eliminará “${post.title}”. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) del.mutate(post.id);
  }

  return (
    <div
      draggable={movable && Boolean(dnd)}
      onDragStart={(e) => {
        if (!movable || !dnd) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        dnd.start(post);
      }}
      onDragEnd={() => dnd?.end()}
      className={cn(
        "group/chip flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] ring-1 transition-colors hover:brightness-110",
        selected ? "ring-2 ring-brand" : STATUS_RING[post.status],
        post.status === "draft" && "opacity-80",
        movable && dnd && "cursor-grab active:cursor-grabbing",
      )}
      style={{ background: channel.softColor }}
    >
      <button
        type="button"
        onClick={() => onSelect?.(post)}
        title={`${channel.name} · ${post.title}${time ? ` · ${time}` : ""}`}
        aria-label={`${channel.name}, ${post.title}${time ? `, ${time}` : ""}`}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: channel.color }} />
        {!compact && time ? <span className="shrink-0 tabular-nums text-ink-muted">{time}</span> : null}
        <span className="min-w-0 flex-1 truncate text-ink">{post.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Acciones"
            className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/chip:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => duplicate.mutate({ id: post.id, input: {} })}>
            <Copy /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-state-danger focus:text-state-danger">
            <Trash2 /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
