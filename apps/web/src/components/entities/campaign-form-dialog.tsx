
import * as React from "react";
import { Loader2, Paperclip, Sparkles, X } from "lucide-react";
import {
  CAMPAIGN_STATUSES,
  type Campaign,
  type CampaignAttachment,
  type CampaignStatus,
  type ChannelId,
} from "@nv/domain";

import { cn } from "@/lib/utils";
import { filterGroups, groupCategories } from "@/lib/groups";
import {
  useCreateCampaign,
  useGenerateVariants,
  useUpdateCampaign,
  useUploadCampaignAttachment,
} from "@/hooks/use-domain-mutations";
import { useGroups, useTemplates } from "@/hooks/use-domain-data";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ScheduleType = "once" | "daily" | "weekly";

const SCHEDULE_OPTIONS: { id: ScheduleType; label: string }[] = [
  { id: "once", label: "Una vez" },
  { id: "daily", label: "Diario" },
  { id: "weekly", label: "Semanal" },
];

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const IG_FORMATS: { id: string; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Historia" },
  { id: "carousel", label: "Carrusel" },
];

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

/** Convert an ISO datetime to the value a <input type="datetime-local"> expects. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign?: Campaign | null;
}) {
  const isEdit = Boolean(campaign);
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const upload = useUploadCampaignAttachment();
  const groups = useGroups();
  const templates = useTemplates();
  const generate = useGenerateVariants();
  const pending = create.isPending || update.isPending;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<CampaignStatus>("borrador");
  const [progress, setProgress] = React.useState(0);
  const [message, setMessage] = React.useState("");
  const [scheduleType, setScheduleType] = React.useState<ScheduleType>("once");
  const [dateTime, setDateTime] = React.useState(""); // once → datetime-local
  const [time, setTime] = React.useState(""); // daily/weekly → HH:MM
  const [scheduleDays, setScheduleDays] = React.useState<number[]>([]);
  const [targetGroups, setTargetGroups] = React.useState<string[]>([]);
  const [groupQuery, setGroupQuery] = React.useState("");
  const [groupCategory, setGroupCategory] = React.useState("");
  const [fb, setFb] = React.useState(false);
  const [ig, setIg] = React.useState(false);
  const [socialFormat, setSocialFormat] = React.useState("feed");
  const [attachments, setAttachments] = React.useState<CampaignAttachment[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const type = campaign?.scheduleType ?? "once";
    setName(campaign?.name ?? "");
    setStatus(campaign?.status ?? "borrador");
    setProgress(campaign?.progress ?? 0);
    setMessage(campaign?.message ?? "");
    setScheduleType(type);
    setDateTime(type === "once" ? isoToLocalInput(campaign?.scheduleAt) : "");
    setTime(type === "once" ? "" : (campaign?.scheduleAt ?? ""));
    setScheduleDays(campaign?.scheduleDays ?? []);
    setTargetGroups(campaign?.targetGroups ?? []);
    setFb(campaign?.channels?.includes("fb") ?? false);
    setIg(campaign?.channels?.includes("ig") ?? false);
    setSocialFormat(campaign?.socialFormat ?? "feed");
    setAttachments(campaign?.attachments ?? []);
    setError(null);
  }, [open, campaign]);

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

  async function generateWithAI() {
    const brief = message.trim() || name.trim();
    if (!brief) {
      setError("Escribe un tema o el nombre de la campaña para generar con IA.");
      return;
    }
    setError(null);
    try {
      const variants = await generate.mutateAsync({ prompt: brief, channel: "wa", tone: "cercano" });
      if (variants[0]?.text) setMessage(variants[0].text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar con IA.");
    }
  }

  function toggleDay(day: number) {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  function toggleGroup(id: string) {
    setTargetGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function submit() {
    setError(null);

    const channels: ChannelId[] = [];
    if (targetGroups.length > 0) channels.push("wa");
    if (fb) channels.push("fb");
    if (ig) channels.push("ig");

    const scheduleAt =
      scheduleType === "once"
        ? dateTime
          ? new Date(dateTime).toISOString()
          : undefined
        : time || undefined;

    const input = {
      name: name.trim(),
      status,
      progress,
      channels,
      message: message.trim() || undefined,
      scheduleType,
      scheduleAt,
      scheduleDays: scheduleType === "weekly" ? scheduleDays : undefined,
      targetGroups,
      attachments,
      socialFormat: ig ? socialFormat : undefined,
      ...(campaign?.accent ? { accent: campaign.accent } : {}),
    };

    const opts = {
      onSuccess: () => onOpenChange(false),
      onError: (err: unknown) => setError(errorMessage(err)),
    };
    if (campaign) update.mutate({ id: campaign.id, input }, opts);
    else create.mutate(input, opts);
  }

  const groupItems = groups.data?.items ?? [];
  const groupCats = groupCategories(groupItems);
  const visibleGroups = filterGroups(groupItems, { q: groupQuery, category: groupCategory });

  function setAllVisible(selected: boolean) {
    const visibleIds = visibleGroups.map((g) => g.id);
    setTargetGroups((prev) =>
      selected
        ? Array.from(new Set([...prev, ...visibleIds]))
        : prev.filter((id) => !visibleIds.includes(id)),
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar campaña" : "Nueva campaña"}
      description={isEdit ? "Actualiza la campaña." : "Planifica una campaña omnicanal."}
      onSubmit={submit}
      pending={pending}
      error={error}
      size="xl"
      submitLabel={isEdit ? "Guardar cambios" : "Crear campaña"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="cp-name">Nombre</Label>
        <Input id="cp-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cp-status">Estado</Label>
          <select
            id="cp-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as CampaignStatus)}
            className={selectClass}
          >
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-progress">Progreso (%)</Label>
          <Input
            id="cp-progress"
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="cp-message">Mensaje</Label>
          <div className="flex items-center gap-1.5">
            {(templates.data?.items.length ?? 0) > 0 ? (
              <select
                aria-label="Usar plantilla"
                defaultValue=""
                onChange={(e) => {
                  const t = templates.data?.items.find((x) => x.id === e.target.value);
                  if (t) setMessage(t.body);
                  e.target.value = "";
                }}
                className="h-7 rounded-md border border-line-soft bg-panel-raised px-2 text-xs text-ink-muted"
              >
                <option value="">Usar plantilla…</option>
                {templates.data?.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={generateWithAI}
              disabled={generate.isPending}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line-soft px-2 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink disabled:opacity-60"
              title="Generar el mensaje con IA (usa el texto o el nombre como tema)"
            >
              {generate.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              IA
            </button>
          </div>
        </div>
        <Textarea
          id="cp-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hola {{grupo}}, tu cita es el {{fecha}} a las {{hora}}."
        />
        <p className="text-[11px] text-ink-faint">
          Variables disponibles:{" "}
          <code className="text-ink-muted">{"{{grupo}}"}</code>{" "}
          <code className="text-ink-muted">{"{{fecha}}"}</code>{" "}
          <code className="text-ink-muted">{"{{hora}}"}</code>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Adjuntos</Label>
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
        <p className="text-[11px] text-ink-faint">
          El primero se envía por WhatsApp; para carrusel de Instagram sube varios.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Programación</Label>
        <div className="flex flex-wrap gap-1.5">
          {SCHEDULE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScheduleType(opt.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                scheduleType === opt.id
                  ? "border-brand/60 bg-brand/10 text-ink"
                  : "border-line-soft text-ink-muted hover:border-line-bright",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {scheduleType === "once" ? (
          <Input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
          />
        ) : (
          <div className="space-y-2">
            {scheduleType === "weekly" ? (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      scheduleDays.includes(day)
                        ? "border-brand/60 bg-brand/10 text-ink"
                        : "border-line-soft text-ink-muted hover:border-line-bright",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>Grupos de WhatsApp</Label>
          <span className="text-[11px] text-ink-faint">{targetGroups.length} seleccionado(s)</span>
        </div>
        {groupItems.length === 0 ? (
          <p className="rounded-lg border border-line-soft bg-panel-raised px-3 py-2 text-xs text-ink-faint">
            No hay grupos. Conecta WhatsApp y sincroniza para difundir a tus grupos.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border border-line-soft bg-panel-raised p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                placeholder="Buscar grupo…"
                className="h-8 flex-1 min-w-[8rem]"
              />
              {groupCats.length > 0 ? (
                <select
                  aria-label="Filtrar por categoría"
                  value={groupCategory}
                  onChange={(e) => setGroupCategory(e.target.value)}
                  className="h-8 rounded-lg border border-line-soft bg-panel-high px-2 text-xs text-ink"
                >
                  <option value="">Todas las categorías</option>
                  {groupCats.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setAllVisible(true)}
                className="rounded-md border border-line-soft px-2 py-0.5 text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
              >
                Seleccionar todos ({visibleGroups.length})
              </button>
              <button
                type="button"
                onClick={() => setAllVisible(false)}
                className="rounded-md border border-line-soft px-2 py-0.5 text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
              >
                Ninguno
              </button>
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-line-soft bg-panel p-1">
              {visibleGroups.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-ink-faint">Sin resultados.</p>
              ) : (
                visibleGroups.map((g) => (
                  <label
                    key={g.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-high"
                  >
                    <input
                      type="checkbox"
                      checked={targetGroups.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="size-4 rounded border-line-strong accent-brand"
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{g.name}</span>
                    {(g.tags ?? []).slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="shrink-0 rounded bg-panel-high px-1.5 py-0.5 text-[10px] text-ink-faint"
                      >
                        {t}
                      </span>
                    ))}
                    <span className="shrink-0 text-[11px] text-ink-faint">{g.members}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Redes sociales</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFb((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              fb
                ? "border-brand/60 bg-brand/10 text-ink"
                : "border-line-soft text-ink-muted hover:border-line-bright",
            )}
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={() => setIg((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              ig
                ? "border-brand/60 bg-brand/10 text-ink"
                : "border-line-soft text-ink-muted hover:border-line-bright",
            )}
          >
            Instagram
          </button>
        </div>
        {ig ? (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="cp-igformat">Formato de Instagram</Label>
            <select
              id="cp-igformat"
              value={socialFormat}
              onChange={(e) => setSocialFormat(e.target.value)}
              className={selectClass}
            >
              {IG_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}
