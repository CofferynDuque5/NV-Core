"use client";

import * as React from "react";
import { Copy, Loader2, Sparkles, Wand2 } from "lucide-react";
import { CHANNEL_LIST } from "@nv/domain";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useGenerateVariants } from "@/hooks/use-domain-mutations";

const TONES = ["Entusiasta", "Profesional", "Cercano", "Urgente", "Divertido"];

export default function AiStudioPage() {
  const [prompt, setPrompt] = React.useState("");
  const [channel, setChannel] = React.useState(CHANNEL_LIST[0]!.id);
  const [tone, setTone] = React.useState(TONES[0]!);
  const generate = useGenerateVariants();
  const variants = generate.data ?? [];

  const canGenerate = prompt.trim().length >= 3 && !generate.isPending;

  function onGenerate() {
    if (!canGenerate) return;
    generate.mutate({ prompt: prompt.trim(), channel, tone });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligencia de contenido"
        title="AI Content Studio"
        description="Genera captions y variantes A/B con IA (OpenAI, Anthropic o Gemini)."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input */}
        <Panel>
          <PanelHeader title="¿Qué quieres promocionar?" />
          <div className="space-y-4 p-4">
            <Textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe tu producto, oferta y público objetivo…"
              className="min-h-[120px]"
            />

            <div className="space-y-1.5">
              <Label>Plataforma destino</Label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNEL_LIST.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => setChannel(ch.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      channel === ch.id
                        ? "border-brand/60 bg-brand/10 text-ink"
                        : "border-line-soft text-ink-muted hover:border-line-bright",
                    )}
                  >
                    {ch.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tono</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      tone === t
                        ? "border-brand-violet/60 bg-brand-violet/10 text-ink"
                        : "border-line-soft text-ink-muted hover:border-line-bright",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={onGenerate} disabled={!canGenerate}>
                {generate.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                Generar variantes
              </Button>
            </div>
          </div>
        </Panel>

        {/* Output */}
        <Panel>
          <PanelHeader title="Variantes generadas" />
          <div className="p-4">
            {generate.isPending ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-panel-raised" />
                ))}
              </div>
            ) : variants.length > 0 ? (
              <ul className="space-y-3">
                {variants.map((v, i) => (
                  <li key={i} className="rounded-lg border border-line-soft bg-panel-raised p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                        {v.tag}
                      </span>
                      <button
                        onClick={() => copy(v.text)}
                        className="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:text-ink"
                        title="Copiar"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ink">{v.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Sparkles}
                title="Sin variantes todavía"
                description="Describe tu campaña y pulsa «Generar variantes». Requiere un proveedor de IA configurado (OpenAI, Anthropic o Gemini)."
                compact
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
