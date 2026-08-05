
import * as React from "react";
import { CHANNEL_LIST, type ChannelId } from "@nv/domain";

import { useCreatePost } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PostScheduleDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  defaultChannel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** YYYY-MM-DD to prefill (e.g. clicked calendar day). */
  defaultDate?: string;
  /** HH:MM to prefill (e.g. clicked calendar time slot). */
  defaultTime?: string;
  /** Channel to preselect (e.g. the workspace's most-used channel). */
  defaultChannel?: ChannelId;
}) {
  const mutation = useCreatePost();
  const [title, setTitle] = React.useState("");
  const [channel, setChannel] = React.useState<ChannelId>(defaultChannel ?? "ig");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("12:00");
  const [copy, setCopy] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setChannel(defaultChannel ?? "ig");
    setDate(defaultDate ?? "");
    setTime(defaultTime ?? "12:00");
    setCopy("");
    setError(null);
  }, [open, defaultDate, defaultTime, defaultChannel]);

  function submit() {
    setError(null);
    const scheduledAt = date ? new Date(`${date}T${time || "12:00"}:00`).toISOString() : undefined;
    mutation.mutate(
      {
        title: title.trim(),
        channel,
        copy: copy.trim() || undefined,
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Programar publicación"
      description="Crea una publicación y colócala en el calendario."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Programar"
    >
      <div className="space-y-1.5">
        <Label htmlFor="p-title">Título</Label>
        <Input id="p-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-channel">Canal</Label>
          <select
            id="p-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelId)}
            className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            {CHANNEL_LIST.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-date">Fecha</Label>
          <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-time">Hora</Label>
          <Input id="p-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-copy">Contenido (opcional)</Label>
        <Textarea id="p-copy" rows={3} value={copy} onChange={(e) => setCopy(e.target.value)} />
      </div>
    </FormDialog>
  );
}
