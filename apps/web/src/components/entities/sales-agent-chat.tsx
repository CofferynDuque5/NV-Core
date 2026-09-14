import * as React from "react";
import { Bot, Loader2, RotateCcw, Send, Sparkles, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentChat } from "@/hooks/use-domain-mutations";

type Turn = { role: "user" | "assistant"; content: string; at: number };

const WELCOME: Turn = {
  role: "assistant",
  content:
    "¡Hola! Soy el Asistente NV (Gemini). Veo todas las secciones de tu panel —campañas, grupos, " +
    "contactos, inbox, calendario, historial, conexiones y automatizaciones— y puedo actuar: crear " +
    "contactos, crear/programar/pausar/enviar campañas, programar publicaciones, resolver " +
    "conversaciones o enviar un mensaje. Pregúntame o pídeme algo.",
  at: Date.now(),
};

const SUGGESTIONS = [
  "¿Qué campañas tengo activas y cuándo corren?",
  "¿Cuántos envíos fallaron hoy y por qué?",
  "Crea el contacto Ana Pérez +584121234567 etiqueta netflix",
  "Pausa la campaña de Netflix",
  "¿Qué conversaciones tengo sin responder?",
];

const time = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Chat-style playground for the sales agent. Keeps the visible history in
 * state, sends it whole on every turn and appends the reply — the same
 * `POST /ai/chat` the automation runner uses for "responder con IA".
 */
export function SalesAgentChat({ className }: { className?: string }) {
  const [turns, setTurns] = React.useState<Turn[]>([WELCOME]);
  const [draft, setDraft] = React.useState("");
  const chat = useAgentChat();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, chat.isPending]);

  function ask(text: string) {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const next: Turn[] = [...turns, { role: "user", content, at: Date.now() }];
    setTurns(next);
    setDraft("");
    chat.mutate(
      {
        // The welcome bubble is UI only; the model gets the real exchange.
        messages: next.filter((t) => t !== WELCOME).map(({ role, content }) => ({ role, content })),
        mode: "asistente",
      },
      {
        onSuccess: ({ reply }) =>
          setTurns((prev) => [...prev, { role: "assistant", content: reply, at: Date.now() }]),
      },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    ask(draft);
  }

  return (
    <Panel className={cn("flex min-h-[520px] flex-col overflow-hidden", className)}>
      <PanelHeader
        title="Asistente NV (Gemini)"
        description="Conectado a todas las secciones del panel: consulta datos reales y ejecuta acciones."
        action={
          <Button variant="ghost" size="sm" onClick={() => setTurns([WELCOME])} disabled={turns.length <= 1}>
            <RotateCcw className="size-4" /> Reiniciar
          </Button>
        }
      />

      <div className="flex-1 space-y-3 overflow-y-auto bg-panel-raised/40 p-4">
        {turns.map((t, i) => {
          const mine = t.role === "user";
          return (
            <div key={i} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
              {!mine ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-violet/15 text-brand-violet">
                  <Bot className="size-4" />
                </span>
              ) : null}
              <div className={cn("max-w-[78%]", mine ? "items-end" : "items-start", "flex flex-col gap-0.5")}>
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                    mine
                      ? "rounded-br-md bg-brand text-white"
                      : "rounded-bl-md border border-line-soft bg-panel text-ink",
                  )}
                >
                  {t.content}
                </div>
                <span className="px-1 text-[10px] tabular-nums text-ink-faint">{time(t.at)}</span>
              </div>
              {mine ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                  <UserRound className="size-4" />
                </span>
              ) : null}
            </div>
          );
        })}

        {chat.isPending ? (
          <div className="flex items-end gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-violet/15 text-brand-violet">
              <Bot className="size-4" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line-soft bg-panel px-3.5 py-2.5">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="size-1.5 animate-bounce rounded-full bg-ink-faint"
                  style={{ animationDelay: `${d * 120}ms` }}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {turns.length <= 1 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 pt-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
            >
              <Sparkles className="mr-1 inline size-3 text-brand" />
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={submit} className="flex items-center gap-2 p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pregunta o pide algo al asistente…"
          className="flex-1"
          aria-label="Mensaje para el agente"
        />
        <Button type="submit" size="icon" disabled={chat.isPending || !draft.trim()} aria-label="Enviar">
          {chat.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </Panel>
  );
}
