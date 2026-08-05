import { CHANNELS, type Post } from "@nv/domain";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { hm } from "@/lib/calendar";
import { useDeletePost, useDuplicatePost } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
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
 * A single publication on the calendar. The whole chip is a quick-actions
 * trigger (duplicate / delete) so managing content is one click — no dialogs to
 * hunt through. Colored + labeled by channel (never color-only, for a11y).
 */
export function PostChip({ post, compact = false }: { post: Post; compact?: boolean }) {
  const channel = CHANNELS[post.channel];
  const duplicate = useDuplicatePost();
  const del = useDeletePost();
  const confirm = useConfirm();
  const time = post.scheduledAt ? hm(new Date(post.scheduledAt)) : "";

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={`${channel.name} · ${post.title}${time ? ` · ${time}` : ""}`}
          aria-label={`${channel.name}, ${post.title}${time ? `, ${time}` : ""}`}
          className={cn(
            "group/chip flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] ring-1 transition-colors hover:brightness-110",
            STATUS_RING[post.status],
            post.status === "draft" && "opacity-80",
          )}
          style={{ background: channel.softColor }}
        >
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: channel.color }} />
          {!compact && time ? <span className="shrink-0 tabular-nums text-ink-muted">{time}</span> : null}
          <span className="min-w-0 flex-1 truncate text-ink">{post.title}</span>
          <MoreHorizontal className="size-3 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover/chip:opacity-100" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuItem onClick={() => duplicate.mutate({ id: post.id, input: {} })}>
          <Copy /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-state-danger focus:text-state-danger">
          <Trash2 /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
