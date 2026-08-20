import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Copy,
  Download,
  Hash,
  Image as ImageIcon,
  Loader2,
  Save,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { CHANNEL_LIST } from "@nv/domain";
import type { AiVariant } from "@nv/domain";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { FORMATS, LENGTHS, TONES, mergeHashtags, wordCount } from "@/lib/ai-studio";
import { aiQuotaState } from "@/lib/plan";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useCreateTemplate,
  useGenerateFlyer,
  useGenerateVariants,
  useImproveMessage,
  useSuggestHashtags,
} from "@/hooks/use-domain-mutations";

const FLYER_SIZES: { id: string; label: string }[] = [
  { id: "1024x1024", label: "Cuadrado" },
  { id: "1024x1536", label: "Vertical (story)" },
  { id: "1536x1024", label: "Horizontal" },
];
import { useAiUsage } from "@/hooks/use-domain-data";

function Chips<T extends string>({
  options,
  value,
  onChange,
  accent = "brand",
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent?: "brand" | "brand-violet";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            value === o.id
              ? accent === "brand"
                ? "border-brand/60 bg-brand/10 text-ink"
                : "border-brand-violet/60 bg-brand-violet/10 text-ink"
              : "border-line-soft text-ink-muted hover:border-line-bright",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AiStudioPage() {
  const [prompt, setPrompt] = React.useState("");
  const [channel, setChannel] = React.useState(CHANNEL_LIST[0]!.id);
  const [tone, setTone] = React.useState(TONES[0]!);
  const [format, setFormat] = React.useState(FORMATS[0]!.id);
  const [length, setLength] = React.useState(LENGTHS[1]!.id);
  const [variants, setVariants] = React.useState<AiVariant[]>([]);
  const [hashtags, setHashtags] = React.useState<string[]>([]);
  const [improvingIdx, setImprovingIdx] = React.useState<number | null>(null);

  const [flyerPrompt, setFlyerPrompt] = React.useState("");
  const [flyerSize, setFlyerSize] = React.useState(FLYER_SIZES[1]!.id);
  const [flyerUrl, setFlyerUrl] = React.useState<string | null>(null);

  const generate = useGenerateVariants();
  const flyer = useGenerateFlyer();
  const improve = useImproveMessage();
  const hashtagsM = useSuggestHashtags();
  const createTemplate = useCreateTemplate();
  const usage = useAiUsage();
  const ws = useWorkspace();
  const quota = usage.data ? aiQuotaState(usage.data) : null;
  const billingHref = `/w/${ws.slug}/configuracion?tab=facturacion`;

  const canGenerate = prompt.trim().length >= 3 && !generate.isPending;

  function onGenerate() {
    if (!canGenerate) return;
    generate.mutate(
      { prompt: prompt.trim(), channel, tone, format, length },
      { onSuccess: (data) => setVariants(data) },
    );
  }

  function onSuggestHashtags() {
    if (prompt.trim().length < 3) {
      toast.error("Escribe un brief para sugerir hashtags.");
      return;
    }
    hashtagsM.mutate(prompt.trim(), { onSuccess: (tags) => setHashtags(tags) });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  function setVariantText(idx: number, text: string) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, text } : v)));
  }

  async function improveVariant(idx: number) {
    setImprovingIdx(idx);
    try {
      const res = await improve.mutateAsync(variants[idx]!.text);
      if (res?.text) {
        setVariantText(idx, res.text);
        toast.success("Variante mejorada");
      }
    } finally {
      setImprovingIdx(null);
    }
  }

  function saveAsTemplate(v: AiVariant) {
    const name = `${v.tag} · ${prompt.trim().slice(0, 32) || "Generado con IA"}`;
    createTemplate.mutate({ name, body: v.text, category: "IA" });
  }

  function onGenerateFlyer() {
    if (flyerPrompt.trim().length < 3) {
      toast.error("Describe el flyer que quieres (producto, oferta, estilo).");
      return;
    }
    flyer.mutate(
      { prompt: flyerPrompt.trim(), size: flyerSize },
      { onSuccess: (res) => setFlyerUrl(res.url) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligencia de contenido"
        title="AI Content Studio"
        description="Genera captions, variantes A/B y hashtags con IA (OpenAI, Anthropic o Gemini)."
        actions={
          usage.data ? (
            <span className="rounded-full border border-line-soft bg-panel px-3 py-1 text-xs text-ink-muted">
              <span className="font-medium text-ink">{usage.data.planName}</span> ·{" "}
              {usage.data.calls}
              {usage.data.quota != null ? ` / ${usage.data.quota}` : ""} usos ·{" "}
              {usage.data.period || "este mes"}
            </span>
          ) : undefined
        }
      />

      {quota?.metered && (quota.nearLimit || quota.exhausted) ? (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
            quota.exhausted
              ? "border-state-warning/40 bg-state-warning/10"
              : "border-line-soft bg-panel-raised",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg",
                quota.exhausted ? "bg-state-warning/15 text-state-warning" : "bg-brand/10 text-brand",
              )}
            >
              <Zap className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-bright">
                {quota.exhausted
                  ? "Alcanzaste el límite mensual de IA"
                  : "Te estás acercando al límite mensual de IA"}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                Has usado {quota.used} de {quota.limit} llamadas este mes en el plan{" "}
                {usage.data?.planName}.
                {quota.canUpgrade ? " Amplía a Pro para uso ilimitado." : " Se renueva el próximo mes."}
              </p>
              <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-panel-high">
                <div
                  className={cn(
                    "h-full rounded-full",
                    quota.exhausted ? "bg-state-warning" : "bg-brand",
                  )}
                  style={{ width: `${quota.pct}%` }}
                />
              </div>
            </div>
          </div>
          {quota.canUpgrade ? (
            <Button asChild size="sm" className="shrink-0 self-start sm:self-center">
              <Link to={billingHref}>
                Amplía a Pro <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Input */}
        <Panel className="h-fit">
          <PanelHeader title="¿Qué quieres promocionar?" />
          <div className="space-y-4 p-4">
            <Textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe tu producto, oferta y público objetivo…"
              className="min-h-[110px]"
            />

            <div className="space-y-1.5">
              <Label>Tipo de contenido</Label>
              <Chips options={FORMATS} value={format} onChange={setFormat} />
            </div>

            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Chips options={CHANNEL_LIST.map((c) => ({ id: c.id, label: c.name }))} value={channel} onChange={setChannel} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tono</Label>
                <Chips options={TONES.map((t) => ({ id: t, label: t }))} value={tone} onChange={setTone} accent="brand-violet" />
              </div>
              <div className="space-y-1.5">
                <Label>Longitud</Label>
                <Chips options={LENGTHS} value={length} onChange={setLength} accent="brand-violet" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={onGenerate} disabled={!canGenerate}>
                {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                Generar variantes
              </Button>
              <Button variant="secondary" size="sm" onClick={onSuggestHashtags} disabled={hashtagsM.isPending}>
                {hashtagsM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Hash className="size-4" />}
                Sugerir hashtags
              </Button>
            </div>

            {hashtags.length > 0 ? (
              <div className="space-y-1.5 rounded-lg border border-line-soft bg-panel-raised p-3">
                <div className="flex items-center justify-between">
                  <Label>Hashtags sugeridos</Label>
                  <button onClick={() => copy(hashtags.join(" "))} className="text-[11px] text-brand hover:underline">
                    Copiar todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {hashtags.map((h) => (
                    <button
                      key={h}
                      onClick={() => copy(h)}
                      className="rounded-full bg-panel-high px-2 py-0.5 text-[11px] text-ink-muted transition-colors hover:text-ink"
                      title="Copiar"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        {/* Output */}
        <Panel>
          <PanelHeader title="Variantes generadas" description={variants.length > 0 ? `${variants.length} opciones` : undefined} />
          <div className="p-4">
            {generate.isPending ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-panel-raised" />
                ))}
              </div>
            ) : variants.length > 0 ? (
              <ul className="space-y-3">
                {variants.map((v, i) => (
                  <li key={i} className="rounded-lg border border-line-soft bg-panel-raised p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">{v.tag}</span>
                      <span className="text-[11px] text-ink-faint">{wordCount(v.text)} palabras</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ink">{v.text}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                      <button onClick={() => copy(v.text)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink">
                        <Copy className="size-3.5" /> Copiar
                      </button>
                      <button
                        onClick={() => improveVariant(i)}
                        disabled={improvingIdx === i}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink disabled:opacity-60"
                      >
                        {improvingIdx === i ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Mejorar
                      </button>
                      {hashtags.length > 0 ? (
                        <button
                          onClick={() => setVariantText(i, mergeHashtags(v.text, hashtags))}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                        >
                          <Hash className="size-3.5" /> Añadir hashtags
                        </button>
                      ) : null}
                      <button
                        onClick={() => saveAsTemplate(v)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                      >
                        <Save className="size-3.5" /> Guardar plantilla
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Sparkles}
                title="Sin variantes todavía"
                description="Describe tu campaña, elige tipo y tono, y pulsa «Generar variantes». Requiere un proveedor de IA configurado (OpenAI, Anthropic o Gemini)."
                compact
              />
            )}
          </div>
        </Panel>
      </div>

      {/* Flyer con IA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Panel className="h-fit">
          <PanelHeader title="Flyer con IA" description="Genera una imagen para tu campaña" />
          <div className="space-y-4 p-4">
            <Textarea
              rows={4}
              value={flyerPrompt}
              onChange={(e) => setFlyerPrompt(e.target.value)}
              placeholder="Ej: flyer promocional de suscripciones de streaming, colores neón, 50% de descuento, estilo moderno…"
              className="min-h-[96px]"
            />
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Chips options={FLYER_SIZES} value={flyerSize} onChange={setFlyerSize} accent="brand-violet" />
            </div>
            <Button size="sm" onClick={onGenerateFlyer} disabled={flyer.isPending}>
              {flyer.isPending ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
              Generar flyer
            </Button>
            <p className="text-[11px] text-ink-faint">
              La generación de imágenes usa la API de OpenAI. Configura{" "}
              <code className="text-ink-muted">OPENAI_API_KEY</code> en el backend para activarla.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Vista previa" />
          <div className="p-4">
            {flyer.isPending ? (
              <div className="aspect-square w-full max-w-md animate-pulse rounded-lg bg-panel-raised" />
            ) : flyerUrl ? (
              <div className="space-y-3">
                <img
                  src={flyerUrl}
                  alt="Flyer generado"
                  className="w-full max-w-md rounded-lg border border-line-soft"
                />
                <a
                  href={flyerUrl}
                  download="flyer-nv-core.png"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
                >
                  <Download className="size-3.5" /> Descargar
                </a>
              </div>
            ) : (
              <EmptyState
                icon={ImageIcon}
                title="Sin flyer todavía"
                description="Describe el flyer y pulsa «Generar flyer». Requiere OPENAI_API_KEY en el backend."
                compact
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
