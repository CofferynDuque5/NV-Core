
import * as React from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { CHANNEL_LIST, type CampaignAttachment, type ChannelId } from "@nv/domain";

import { useCreatePost, useUploadCampaignAttachment } from "@/hooks/use-domain-mutations";
import { surfaceForChannel } from "@/lib/content-preview";
import { FormDialog, errorMessage } from "./form-dialog";
import { ContentPreview } from "./content-preview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const IG_FORMATS = ["feed", "reel", "story", "carousel"] as const;

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
  const upload = useUploadCampaignAttachment();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [title, setTitle] = React.useState("");
  const [channel, setChannel] = React.useState<ChannelId>(defaultChannel ?? "ig");
  const [igFormat, setIgFormat] = React.useState<string>("feed");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("12:00");
  const [copy, setCopy] = React.useState("");
  const [attachments, setAttachments] = React.useState<CampaignAttachment[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setChannel(defaultChannel ?? "ig");
    setIgFormat("feed");
    setDate(defaultDate ?? "");
    setTime(defaultTime ?? "12:00");
    setCopy("");
    setAttachments([]);
    setError(null);
  }, [open, defaultDate, defaultTime, defaultChannel]);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    for (const file of files) {
      try {
        const att = await upload.mutateAsync(file);
        setAttachments((prev) => [...prev, att]);
      } catch {
        /* toast handled in the hook */
      }
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    setError(null);
    const scheduledAt = date ? new Date(`${date}T${time || "12:00"}:00`).toISOString() : undefined;
    mutation.mutate(
      {
        title: title.trim(),
        channel,
        copy: copy.trim() || undefined,
        attachments,
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
      size="lg"
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

      {channel === "ig" ? (
        <div className="space-y-1.5">
          <Label htmlFor="p-igformat">Formato de Instagram</Label>
          <select
            id="p-igformat"
            value={igFormat}
            onChange={(e) => setIgFormat(e.target.value)}
            className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            {IG_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="p-copy">Contenido (opcional)</Label>
        <Textarea id="p-copy" rows={3} value={copy} onChange={(e) => setCopy(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Imagen o video</Label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={onPickFiles}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-soft bg-panel-raised px-3 py-2 text-xs text-ink-muted transition-colors hover:border-line-bright disabled:opacity-60"
        >
          {upload.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
          {upload.isPending ? "Subiendo…" : "Subir imagen o video (Cloudinary)"}
        </button>
        {attachments.length > 0 ? (
          <div className="space-y-0.5">
            {attachments.map((att, i) => (
              <div
                key={`${att.url}-${i}`}
                className="flex items-center gap-2 rounded-md bg-panel-raised px-2 py-1.5 text-xs"
              >
                <span className="shrink-0 rounded bg-panel-high px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                  {att.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{att.filename ?? att.url}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="rounded p-0.5 text-ink-faint hover:text-state-danger"
                  title="Quitar"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Vista previa</Label>
        <ContentPreview
          message={copy}
          attachments={attachments}
          surfaces={[surfaceForChannel(channel, { igFormat })]}
        />
        <p className="text-[11px] text-ink-faint">
          Así se verá tu publicación en {surfaceForChannel(channel, { igFormat }).label} antes de
          programarla.
        </p>
      </div>
    </FormDialog>
  );
}
