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
import { formatTime12h } from "@/lib/schedule";
import {
  useCreateCampaign,
  useGenerateVariants,
  useUpdateCampaign,
  useUploadCampaignAttachment,
} from "@/hooks/use-domain-mutations";
import { useGroups, useTemplates } from "@/hooks/use-domain-data";
import { FormDialog, errorMessage } from "./form-dialog";
import { ContentPreview } from "./content-preview";
import { AiFlyerButton } from "./ai-flyer-button";
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

/** Small titled divider to break the long form into scannable sections. */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-ink-faint text-[11px] font-semibold uppercase tracking-wide">{children}</h3>
  );
}

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
  const [time, setTime] = React.useState(""); // daily/weekly → the time being added
  const [scheduleTimes, setScheduleTimes] = React.useState<string[]>([]); // daily/weekly → HH:MM[]
  const [scheduleDays, setScheduleDays] = React.useState<number[]>([]);
  const [targetGroups, setTargetGroups] = React.useState<string[]>([]);
  const [groupQuery, setGroupQuery] = React.useState("");
  const [groupCategory, setGroupCategory] = React.useState("");
  const [fb, setFb] = React.useState(false);
  const [ig, setIg] = React.useState(false);
  const [postToWaStatus, setPostToWaStatus] = React.useState(false);
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
    setTime("");
    setScheduleTimes(
      type === "once"
        ? []
        : campaign?.scheduleTimes?.length
          ? campaign.scheduleTimes
          : campaign?.scheduleAt
            ? [campaign.scheduleAt]
            : [],
    );
    setScheduleDays(campaign?.scheduleDays ?? []);
    setTargetGroups(campaign?.targetGroups ?? []);
    setFb(campaign?.channels?.includes("fb") ?? false);
    setIg(campaign?.channels?.includes("ig") ?? false);
    setPostToWaStatus(campaign?.postToWaStatus ?? false);
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
      const variants = await generate.mutateAsync({
        prompt: brief,
        channel: "wa",
        tone: "cercano",
      });
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

  function addTime() {
    const t = time.trim();
    if (!t) return;
    setScheduleTimes((prev) => (prev.includes(t) ? prev : [...prev, t].sort()));
    setTime("");
  }
  function removeTime(t: string) {
    setScheduleTimes((prev) => prev.filter((x) => x !== t));
  }

  function submit() {
    setError(null);

    const channels: ChannelId[] = [];
    const selected = (groups.data?.items ?? []).filter((g) => targetGroups.includes(g.id));
    if (selected.some((g) => g.channel === "wa")) channels.push("wa");
    if (selected.some((g) => g.channel === "tg")) channels.push("tg");
    if (fb) channels.push("fb");
    if (ig) channels.push("ig");

    // Include any time still typed in the box but not yet "added".
    const times =
      scheduleType === "once"
        ? []
        : Array.from(new Set([...scheduleTimes, ...(time.trim() ? [time.trim()] : [])])).sort();

    const scheduleAt =
      scheduleType === "once"
        ? dateTime
          ? new Date(dateTime).toISOString()
          : undefined
        : times[0] || undefined;

    const input = {
      name: name.trim(),
      status,
      progress,
      channels,
      message: message.trim() || undefined,
      scheduleType,
      scheduleAt,
      scheduleTimes: scheduleType === "once" ? undefined : times,
      scheduleDays: scheduleType === "weekly" ? scheduleDays : undefined,
      targetGroups,
      attachments,
      socialFormat: ig ? socialFormat : undefined,
      postToWaStatus,
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
  const selectedGroups = groupItems.filter((g) => targetGroups.includes(g.id));
  const hasWaGroup = selectedGroups.some((g) => g.channel === "wa");
  const hasTgGroup = selectedGroups.some((g) => g.channel === "tg");

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
      size="2xl"
      submitLabel={isEdit ? "Guardar cambios" : "Crear campaña"}
    >
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Columna izquierda: edición ─────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {/* Sección: Contenido */}
          <section className="space-y-4">
            <SectionHeader>Contenido</SectionHeader>

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
                      className="border-line-soft bg-panel-raised text-ink-muted h-7 rounded-md border px-2 text-xs"
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
                    className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors disabled:opacity-60"
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
              <p className="text-ink-faint text-[11px]">
                Variables disponibles: <code className="text-ink-muted">{"{{grupo}}"}</code>{" "}
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
                className="border-line-soft bg-panel-raised text-ink-muted hover:border-line-bright flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors disabled:opacity-60"
              >
                {upload.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Paperclip className="size-4" />
                )}
                {upload.isPending ? "Subiendo…" : "Subir imagen o video (Cloudinary)"}
              </button>
              <AiFlyerButton
                defaultPrompt={message.trim() || name.trim()}
                onGenerated={(att) => setAttachments((prev) => [...prev, att])}
              />
              {attachments.length > 0 ? (
                <div className="space-y-0.5">
                  {attachments.map((att, i) => (
                    <div
                      key={`${att.url}-${i}`}
                      className="bg-panel-raised flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                    >
                      <span className="bg-panel-high text-ink-faint shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase">
                        {att.kind}
                      </span>
                      <span className="text-ink min-w-0 flex-1 truncate">
                        {att.filename ?? att.url}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="text-ink-faint hover:text-state-danger rounded p-0.5"
                        title="Quitar"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="text-ink-faint text-[11px]">
                El primero se envía por WhatsApp; para carrusel de Instagram sube varios.
              </p>
            </div>
          </section>

          {/* Sección: Programación */}
          <section className="border-line-soft space-y-4 border-t pt-5">
            <SectionHeader>Programación</SectionHeader>
            <div className="space-y-1.5">
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
                <>
                  <Input
                    type="datetime-local"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                  />
                  {dateTime ? (
                    <p className="text-ink-faint text-[11px]">
                      Se enviará a las {formatTime12h(dateTime)}.
                    </p>
                  ) : null}
                </>
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
                  <div className="space-y-1.5">
                    <Label className="text-ink-muted text-xs">
                      Horas de envío (puedes agregar varias)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={addTime}
                        disabled={!time}
                        className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                      >
                        Agregar hora
                      </button>
                    </div>
                    {scheduleTimes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {scheduleTimes.map((t) => (
                          <span
                            key={t}
                            className="border-brand/40 bg-brand/10 text-ink inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                          >
                            {formatTime12h(t)}
                            <button
                              type="button"
                              onClick={() => removeTime(t)}
                              className="text-ink-faint hover:text-state-danger"
                              aria-label={`Quitar ${t}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-ink-faint text-[11px]">
                        Agrega una o varias horas (
                        {scheduleType === "daily" ? "se enviará cada día" : "en los días elegidos"}
                        ).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Sección: Destinos */}
          <section className="border-line-soft space-y-4 border-t pt-5">
            <SectionHeader>Destinos</SectionHeader>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Grupos (WhatsApp / Telegram)</Label>
                <span className="text-ink-faint text-[11px]">
                  {targetGroups.length} seleccionado(s)
                </span>
              </div>
              {groupItems.length === 0 ? (
                <p className="border-line-soft bg-panel-raised text-ink-faint rounded-lg border px-3 py-2 text-xs">
                  No hay grupos. Conecta WhatsApp y sincroniza para difundir a tus grupos.
                </p>
              ) : (
                <div className="border-line-soft bg-panel-raised space-y-2 rounded-lg border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={groupQuery}
                      onChange={(e) => setGroupQuery(e.target.value)}
                      placeholder="Buscar grupo…"
                      className="h-8 min-w-[8rem] flex-1"
                    />
                    {groupCats.length > 0 ? (
                      <select
                        aria-label="Filtrar por categoría"
                        value={groupCategory}
                        onChange={(e) => setGroupCategory(e.target.value)}
                        className="border-line-soft bg-panel-high text-ink h-8 rounded-lg border px-2 text-xs"
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
                      className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink rounded-md border px-2 py-0.5 transition-colors"
                    >
                      Seleccionar todos ({visibleGroups.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllVisible(false)}
                      className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink rounded-md border px-2 py-0.5 transition-colors"
                    >
                      Ninguno
                    </button>
                  </div>
                  <div className="border-line-soft bg-panel max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
                    {visibleGroups.length === 0 ? (
                      <p className="text-ink-faint px-2 py-3 text-center text-xs">
                        Sin resultados.
                      </p>
                    ) : (
                      visibleGroups.map((g) => (
                        <label
                          key={g.id}
                          className="hover:bg-panel-high flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={targetGroups.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                            className="border-line-strong accent-brand size-4 rounded"
                          />
                          <span className="text-ink min-w-0 flex-1 truncate">{g.name}</span>
                          <span
                            className={
                              g.channel === "tg"
                                ? "shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400"
                                : "shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                            }
                          >
                            {g.channel === "tg" ? (g.kind === "channel" ? "Canal TG" : "TG") : "WA"}
                          </span>
                          {(g.tags ?? []).slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="bg-panel-high text-ink-faint shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                          <span className="text-ink-faint shrink-0 text-[11px]">{g.members}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Estado de WhatsApp</Label>
              <label className="border-line-soft bg-panel-raised flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={postToWaStatus}
                  onChange={(e) => setPostToWaStatus(e.target.checked)}
                  className="border-line-strong mt-0.5 size-4 rounded accent-emerald-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block text-sm">
                    Publicar también en mi Estado de WhatsApp
                  </span>
                  <span className="text-ink-faint block text-[11px]">
                    Usa el mensaje y la primera imagen/video como Estado (Baileys). Se programa en
                    el calendario junto con la campaña.
                  </span>
                </span>
              </label>
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
          </section>
        </div>

        {/* ── Columna derecha: vista previa (sticky) ─────────────────── */}
        <div className="min-w-0">
          <div className="space-y-1.5 lg:sticky lg:top-0">
            <Label>Vista previa</Label>
            <ContentPreview
              message={message}
              attachments={attachments}
              groupName={selectedGroups[0]?.name}
              hasWaGroup={hasWaGroup}
              hasTgGroup={hasTgGroup}
              waStatus={postToWaStatus}
              fb={fb}
              ig={ig}
              igFormat={socialFormat}
            />
            <p className="text-ink-faint text-[11px]">
              Así se verá tu contenido en cada canal antes de programar o publicar.
            </p>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
