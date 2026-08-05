import * as React from "react";
import { CHANNELS, CHANNEL_LIST, type ChannelId, type Post, type PostStatus } from "@nv/domain";
import { AlertTriangle, Copy, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { addDays, hm, ymd, conflictsFor, sameDayOthers } from "@/lib/calendar";
import { useDeletePost, useDuplicatePost, useUpdatePost } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS: Record<PostStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-line-strong/40 text-ink-muted" },
  scheduled: { label: "Programada", cls: "bg-brand/15 text-brand" },
  publishing: { label: "Publicando", cls: "bg-brand/15 text-brand" },
  sent: { label: "Enviada", cls: "bg-state-success/15 text-state-success" },
  error: { label: "Error", cls: "bg-state-danger/15 text-state-danger" },
};

/**
 * The operational hub: everything about a publication — preview, inline
 * edit/reschedule, conflicts and same-day context — without leaving the
 * calendar. Reuses the S1 update/duplicate/delete mutations.
 */
export function PostPanel({
  post,
  posts,
  onClose,
  onSelect,
  onMove,
}: {
  post: Post;
  posts: Post[];
  onClose: () => void;
  onSelect: (p: Post) => void;
  /** One-click / keyboard-accessible reschedule (same primitive as drag&drop). */
  onMove?: (post: Post, day: Date, time?: string) => void;
}) {
  const update = useUpdatePost();
  const duplicate = useDuplicatePost();
  const del = useDeletePost();
  const confirm = useConfirm();

  const readOnly = post.status === "sent" || post.status === "publishing";

  const [title, setTitle] = React.useState(post.title);
  const [channel, setChannel] = React.useState<ChannelId>(post.channel);
  const [copy, setCopy] = React.useState(post.copy ?? "");
  const [date, setDate] = React.useState(post.scheduledAt ? ymd(new Date(post.scheduledAt)) : "");
  const [time, setTime] = React.useState(post.scheduledAt ? hm(new Date(post.scheduledAt)) : "12:00");

  // Re-seed when the selected post changes.
  React.useEffect(() => {
    setTitle(post.title);
    setChannel(post.channel);
    setCopy(post.copy ?? "");
    setDate(post.scheduledAt ? ymd(new Date(post.scheduledAt)) : "");
    setTime(post.scheduledAt ? hm(new Date(post.scheduledAt)) : "12:00");
  }, [post]);

  const scheduledAt = date ? new Date(`${date}T${time || "12:00"}:00`).toISOString() : null;
  const nextStatus: PostStatus = !scheduledAt
    ? "draft"
    : post.status === "draft"
      ? "scheduled"
      : post.status;

  const dirty =
    title !== post.title ||
    channel !== post.channel ||
    (copy ?? "") !== (post.copy ?? "") ||
    (scheduledAt ?? null) !== (post.scheduledAt ?? null);

  const conflicts = React.useMemo(() => conflictsFor(post, posts), [post, posts]);
  const siblings = React.useMemo(() => sameDayOthers(post, posts), [post, posts]);
  const ch = CHANNELS[channel];

  function save() {
    update.mutate(
      {
        id: post.id,
        input: { title: title.trim(), channel, copy: copy.trim() || undefined, scheduledAt, status: nextStatus },
      },
      { onSuccess: () => toast.success("Cambios guardados") },
    );
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Eliminar publicación",
      description: `Se eliminará “${post.title}”.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) {
      del.mutate(post.id);
      onClose();
    }
  }

  return (
    <div className="flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-line-soft bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
          <span className="truncate text-sm font-semibold text-ink-bright">{ch.name}</span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS[post.status].cls)}>
            {STATUS[post.status].label}
          </span>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-ink-muted hover:bg-panel-raised hover:text-ink">
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Live preview */}
        <div className="overflow-hidden rounded-lg border border-line-soft">
          <div className="h-1" style={{ background: ch.color }} />
          <div className="space-y-1.5 p-3">
            <div className="text-sm font-semibold text-ink-bright">{title || "Sin título"}</div>
            {copy ? <p className="whitespace-pre-wrap text-xs text-ink-muted">{copy}</p> : null}
            {post.hashtags?.length ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {post.hashtags.map((h) => (
                  <span key={h} className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand">
                    #{h.replace(/^#/, "")}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Conflicts */}
        {conflicts.length > 0 ? (
          <div className="rounded-lg border border-state-warning/40 bg-state-warning/10 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-state-warning">
              <AlertTriangle className="size-3.5" /> {conflicts.length} conflicto{conflicts.length > 1 ? "s" : ""} en {ch.name}
            </div>
            <div className="space-y-0.5">
              {conflicts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] text-ink-muted hover:bg-panel-raised"
                >
                  <span className="tabular-nums">{c.scheduledAt ? hm(new Date(c.scheduledAt)) : ""}</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Inline edit */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pp-title">Título</Label>
            <Input id="pp-title" value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pp-date">Fecha</Label>
              <Input id="pp-date" type="date" value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-time">Hora</Label>
              <Input id="pp-time" type="time" value={time} disabled={readOnly} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {!readOnly && onMove && post.scheduledAt ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-ink-faint">Mover:</span>
              {[
                { label: "−1 día", days: -1 },
                { label: "+1 día", days: 1 },
                { label: "+1 sem", days: 7 },
              ].map((n) => (
                <button
                  key={n.label}
                  onClick={() => onMove(post, addDays(new Date(post.scheduledAt!), n.days))}
                  className="rounded-md border border-line-soft px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-line-bright hover:text-ink"
                >
                  {n.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="pp-channel">Canal</Label>
            <select
              id="pp-channel"
              value={channel}
              disabled={readOnly}
              onChange={(e) => setChannel(e.target.value as ChannelId)}
              className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 disabled:opacity-60"
            >
              {CHANNEL_LIST.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-copy">Contenido</Label>
            <Textarea id="pp-copy" rows={4} value={copy} disabled={readOnly} onChange={(e) => setCopy(e.target.value)} />
          </div>
          {readOnly ? (
            <p className="text-[11px] text-ink-faint">Una publicación {STATUS[post.status].label.toLowerCase()} no se puede editar.</p>
          ) : null}
        </div>

        {/* Same-day context */}
        {siblings.length > 0 ? (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              Ese día · {siblings.length}
            </div>
            <div className="space-y-0.5">
              {siblings.map((s) => {
                const sc = CHANNELS[s.channel];
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-panel-raised"
                  >
                    <span className="w-10 shrink-0 tabular-nums text-ink-faint">{s.scheduledAt ? hm(new Date(s.scheduledAt)) : ""}</span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: sc.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Sticky actions */}
      <div className="flex items-center gap-2 border-t border-line p-3">
        {!readOnly ? (
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending} className="flex-1">
            <Save className="size-4" /> Guardar
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => duplicate.mutate({ id: post.id, input: {} })}
          disabled={duplicate.isPending}
          title="Duplicar"
        >
          <Copy className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-state-danger hover:bg-state-danger/10"
          title="Eliminar"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
