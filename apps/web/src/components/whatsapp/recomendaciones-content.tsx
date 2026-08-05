
import * as React from "react";
import { BarChart2, Check, Clock, Copy, Loader2, Sparkles, Wand2 } from "lucide-react";

import { useAiRecommendations } from "@/hooks/use-domain-data";
import { useImproveMessage } from "@/hooks/use-domain-mutations";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function RecomendacionesContent({ showHeader = true }: { showHeader?: boolean }) {
  const [enabled, setEnabled] = React.useState(false);
  const recs = useAiRecommendations(enabled);

  const data = recs.data;
  const times = data?.times;
  const aiConfigured = data?.aiConfigured ?? true;
  const loading = enabled && (recs.isLoading || recs.isFetching);

  function generar() {
    if (!enabled) {
      setEnabled(true);
    } else {
      void recs.refetch();
    }
  }

  const actions = (
    <Button size="sm" onClick={generar} disabled={loading}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {enabled ? "Actualizar" : "Generar recomendaciones"}
    </Button>
  );

  const maxCount = times ? Math.max(1, ...times.byDay.map((d) => d.count)) : 1;

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow="WhatsApp · Inteligencia"
          title="Recomendaciones IA"
          description="Sugerencias generadas con IA y mejores horarios según tu historial de envíos."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            Sugerencias generadas con IA y mejores horarios según tu historial de envíos.
          </p>
          {actions}
        </div>
      )}

      {data && !aiConfigured ? (
        <p className="rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          No hay claves de IA configuradas (OPENAI / ANTHROPIC / GEMINI). Las recomendaciones
          generadas por IA no están disponibles, pero los mejores horarios se calculan igual a
          partir de tu historial.
        </p>
      ) : null}

      {/* Recomendaciones generadas */}
      <Panel>
        <PanelHeader title="Recomendaciones" />
        <div className="p-4">
          {!enabled ? (
            <p className="text-sm text-ink-muted">
              Pulsa <span className="font-medium text-ink">Generar recomendaciones</span> para que
              la IA analice tus campañas y te sugiera mejoras.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Generando recomendaciones…
            </div>
          ) : recs.isError ? (
            <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
              No se pudieron generar las recomendaciones.
            </p>
          ) : (data?.recommendations.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-muted">
              No hay recomendaciones por ahora. Envía algunas campañas y vuelve a generar.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data?.recommendations.map((r, i) => (
                <div key={i} className="nv-panel flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink-bright">{r.titulo}</h3>
                    {r.categoria ? <Badge variant="default">{r.categoria}</Badge> : null}
                  </div>
                  <p className="text-xs leading-relaxed text-ink-muted">{r.detalle}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* Mejores horarios */}
      <Panel>
        <PanelHeader
          title="Mejores horarios"
          action={<Clock className="size-4 text-ink-faint" />}
        />
        <div className="space-y-4 p-4">
          {!enabled ? (
            <p className="text-sm text-ink-muted">
              Genera las recomendaciones para ver tu actividad por día.
            </p>
          ) : !times || times.sampleSize === 0 ? (
            <p className="text-sm text-ink-muted">
              Todavía no hay suficientes datos. Envía algunas campañas para calcular tus mejores
              horarios.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {times.topDay ? (
                  <Badge variant="success">
                    <BarChart2 className="size-3.5" /> Mejor día: {times.topDay}
                  </Badge>
                ) : null}
                {times.topHour ? (
                  <Badge variant="default">
                    <Clock className="size-3.5" /> Mejor hora: {times.topHour}
                  </Badge>
                ) : null}
                <Badge variant="neutral">{times.sampleSize} envíos analizados</Badge>
              </div>

              <div className="space-y-2">
                {times.byDay.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-ink-muted">{d.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-violet"
                        style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-faint">
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* Mejorar un mensaje */}
      <ImproveMessageBox />
    </div>
  );
}

function ImproveMessageBox() {
  const improve = useImproveMessage();
  const [message, setMessage] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function run() {
    const text = message.trim();
    if (!text) return;
    const res = await improve.mutateAsync(text).catch(() => null);
    if (res) setResult(res.text);
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Panel>
      <PanelHeader title="Mejorar un mensaje" action={<Wand2 className="size-4 text-ink-faint" />} />
      <div className="space-y-3 p-4">
        <p className="text-xs text-ink-faint">
          Pega un mensaje y la IA lo reescribirá para hacerlo más claro y persuasivo.
        </p>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe o pega el mensaje que quieres mejorar…"
          rows={4}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={run} disabled={improve.isPending || message.trim().length === 0}>
            {improve.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Mejorar mensaje
          </Button>
        </div>

        {result ? (
          <div className="space-y-2 rounded-lg border border-line bg-panel-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Mensaje mejorado
              </span>
              <Button variant="ghost" size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
              {result}
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
