"use client";

import * as React from "react";
import { Languages, Sparkles, TestTube2, Wand2 } from "lucide-react";
import { CHANNEL_LIST } from "@nv/domain";

import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const TONES = ["Entusiasta", "Profesional", "Cercano", "Urgente", "Divertido"];

export default function AiStudioPage() {
  const [channel, setChannel] = React.useState(CHANNEL_LIST[0]!.id);
  const [tone, setTone] = React.useState(TONES[0]!);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligencia de contenido"
        title="AI Content Studio"
        description="Genera captions, variantes A/B y hashtags con IA."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input */}
        <Panel>
          <PanelHeader title="¿Qué quieres promocionar?" />
          <div className="space-y-4 p-4">
            <Textarea
              rows={5}
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
              <Button size="sm" disabled title="Conecta un proveedor de IA">
                <Wand2 className="size-4" /> Generar variantes
              </Button>
              <Button variant="outline" size="sm" disabled>
                <TestTube2 className="size-4" /> Prueba A/B
              </Button>
              <Button variant="ghost" size="sm" disabled>
                <Languages className="size-4" /> Traducir
              </Button>
            </div>
          </div>
        </Panel>

        {/* Output */}
        <Panel>
          <PanelHeader title="Variantes generadas" />
          <div className="p-4">
            <EmptyState
              icon={Sparkles}
              title="Sin variantes todavía"
              description="Conecta OpenAI, Anthropic o Gemini para generar contenido optimizado por plataforma."
              compact
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
