import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { CHANNEL_LIST, getChannel, type AiContentPlanItem, type ChannelId } from "@nv/domain";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useServices } from "@/hooks/use-services";
import { useWorkspace } from "@/hooks/use-workspace";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const PLAN_CHANNELS = CHANNEL_LIST.filter((c) => ["ig", "fb", "wa", "tg"].includes(c.id));

/** Curated ready-made plans (no AI needed) — the user edits from here. */
const EXAMPLES: { label: string; items: AiContentPlanItem[] }[] = [
  {
    label: "Streaming / Suscripciones",
    items: [
      { day: 1, channel: "ig", title: "Catálogo estrella", copy: "🍿 Todo tu streaming en un solo lugar. Netflix, Disney+, HBO y más desde $9/mes. ¿Cuál activamos hoy?" },
      { day: 2, channel: "wa", title: "Oferta flash", copy: "🔥 Solo hoy: Combo 3 plataformas por $20/mes. Responde 'QUIERO' y te activo en minutos." },
      { day: 3, channel: "fb", title: "Testimonio", copy: "⭐ \"Llevo 6 meses y nunca se ha caído\". Únete a cientos de clientes felices. Escríbenos." },
      { day: 4, channel: "ig", title: "Tip de uso", copy: "¿Sabías que puedes ver en 4 dispositivos a la vez? Te enseñamos cómo. 👇" },
      { day: 5, channel: "wa", title: "Recordatorio", copy: "Tu plan vence pronto ⏰ Renueva hoy y mantén tu maratón sin cortes." },
    ],
  },
  {
    label: "Restaurante / Café",
    items: [
      { day: 1, channel: "ig", title: "Plato del día", copy: "☕ Hoy: nuestro especial de la casa recién hecho. ¿Te lo apartamos? Ven antes de que se acabe." },
      { day: 2, channel: "fb", title: "Promo 2x1", copy: "🥐 Martes de 2x1 en toda la repostería. Trae a alguien y endulcen el día. ¡Los esperamos!" },
      { day: 3, channel: "ig", title: "Detrás de cámaras", copy: "Así preparamos tu pedido cada mañana 👨‍🍳 Calidad de verdad, sin atajos." },
      { day: 4, channel: "wa", title: "Pedidos", copy: "📲 Pide por WhatsApp y recoge sin filas. Escríbenos tu orden y te avisamos cuando esté lista." },
    ],
  },
  {
    label: "Servicios / Freelance",
    items: [
      { day: 1, channel: "ig", title: "Antes / Después", copy: "✨ Un pequeño cambio, gran diferencia. Mira este resultado y cuéntame tu proyecto." },
      { day: 2, channel: "fb", title: "Caso de éxito", copy: "📈 Ayudamos a un cliente a duplicar sus ventas en 60 días. ¿Quieres resultados así? Hablemos." },
      { day: 3, channel: "wa", title: "Consulta gratis", copy: "🎁 Esta semana: diagnóstico gratis de tu negocio. Responde este mensaje y agendamos." },
      { day: 4, channel: "ig", title: "Tip de valor", copy: "3 errores que te cuestan clientes (y cómo evitarlos) 🧵 Guarda este post." },
    ],
  },
];

const TONES = ["cercano", "profesional", "divertido", "persuasivo"];

/** Add today + (day-1) at 10:00 as a scheduled ISO datetime. */
function scheduledFor(startDate: string, dayOffset: number): string {
  const base = startDate ? new Date(`${startDate}T10:00:00`) : new Date();
  if (!startDate) base.setHours(10, 0, 0, 0);
  base.setDate(base.getDate() + (dayOffset - 1));
  return base.toISOString();
}

export function ContentPlanner() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();

  const [topic, setTopic] = React.useState("");
  const [days, setDays] = React.useState(7);
  const [tone, setTone] = React.useState("cercano");
  const [channels, setChannels] = React.useState<ChannelId[]>(["ig", "fb", "wa"]);
  const [items, setItems] = React.useState<AiContentPlanItem[]>([]);
  const [startDate, setStartDate] = React.useState("");

  const generate = useMutation({
    mutationFn: () =>
      svc.ai.generateContentPlan(ws.id, { topic: topic.trim(), days, channels, tone }),
    onSuccess: (plan) => {
      setItems(plan);
      toast.success(`Plan de ${plan.length} días generado`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo generar el plan"),
  });

  const addToCalendar = useMutation({
    mutationFn: async () => {
      for (const it of items) {
        await svc.posts.create(ws.id, {
          channel: it.channel,
          title: it.title || `Publicación día ${it.day}`,
          copy: it.copy,
          hashtags: it.hashtags,
          status: "scheduled",
          scheduledAt: scheduledFor(startDate, it.day),
        });
      }
      return items.length;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "posts"] });
      void qc.invalidateQueries({ queryKey: [ws.id, "calendar"] });
      toast.success(`${n} publicación(es) agregadas al calendario`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo agregar al calendario"),
  });

  function toggleChannel(id: ChannelId) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }
  function patchItem(i: number, patch: Partial<AiContentPlanItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  return (
    <Panel>
      <PanelHeader
        title="Planificación de contenidos con IA"
        description="Genera un plan de publicaciones, edítalo y agrégalo al calendario."
      />
      <div className="space-y-4 p-4">
        {/* Controls */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cp-topic">Tema o negocio</Label>
            <Input
              id="cp-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ej: venta de suscripciones de streaming a bajo precio"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-days">Días</Label>
            <Input
              id="cp-days"
              type="number"
              min={1}
              max={31}
              value={days}
              onChange={(e) => setDays(Math.min(31, Math.max(1, Number(e.target.value) || 7)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-tone">Tono</Label>
            <select
              id="cp-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Canales</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChannel(c.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    channels.includes(c.id)
                      ? "border-brand/60 bg-brand/10 text-ink"
                      : "border-line-soft text-ink-muted hover:border-line-bright",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => generate.mutate()} disabled={generate.isPending || topic.trim().length < 3}>
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generar plan con IA
          </Button>
          <span className="text-xs text-ink-faint">o carga un ejemplo listo:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setItems(ex.items);
                toast.success(`Ejemplo "${ex.label}" cargado`);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
            >
              <Wand2 className="size-3.5" /> {ex.label}
            </button>
          ))}
        </div>

        {/* Plan list */}
        {items.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                Empezar el
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 w-auto"
                />
                <span className="text-ink-faint">(vacío = desde hoy)</span>
              </label>
              <Button
                size="sm"
                onClick={() => addToCalendar.mutate()}
                disabled={addToCalendar.isPending}
              >
                {addToCalendar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CalendarPlus className="size-4" />
                )}
                Agregar {items.length} al calendario
              </Button>
            </div>

            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="nv-panel space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-panel-high px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                      Día {it.day}
                    </span>
                    <select
                      value={it.channel}
                      onChange={(e) => patchItem(i, { channel: e.target.value as ChannelId })}
                      className="h-7 rounded-md border border-line-soft bg-panel-raised px-2 text-xs text-ink"
                    >
                      {PLAN_CHANNELS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span
                      className="ml-1 h-2 w-2 rounded-full"
                      style={{ background: getChannel(it.channel).color }}
                    />
                    <Input
                      value={it.title}
                      onChange={(e) => patchItem(i, { title: e.target.value })}
                      className="h-7 flex-1 min-w-[10rem] text-xs"
                      placeholder="Título"
                    />
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded p-1 text-ink-faint hover:text-state-danger"
                      title="Quitar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Textarea
                    value={it.copy}
                    onChange={(e) => patchItem(i, { copy: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line-soft bg-panel-raised px-3 py-6 text-center text-xs text-ink-faint">
            Genera un plan con IA o carga un ejemplo para empezar. Podrás editar cada publicación
            antes de enviarla al calendario.
          </p>
        )}
      </div>
    </Panel>
  );
}
