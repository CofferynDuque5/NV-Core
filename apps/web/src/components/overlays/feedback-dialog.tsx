import * as React from "react";
import { Bug, HelpCircle, Lightbulb, MessageSquare, Send, Star } from "lucide-react";
import type { FeedbackType } from "@nv/domain";

import { useUiStore } from "@/stores/ui-store";
import { useSubmitFeedback } from "@/hooks/use-domain-mutations";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const TYPES: { value: FeedbackType; label: string; icon: typeof Bug }[] = [
  { value: "idea", label: "Idea", icon: Lightbulb },
  { value: "bug", label: "Problema", icon: Bug },
  { value: "question", label: "Pregunta", icon: HelpCircle },
  { value: "other", label: "Otro", icon: MessageSquare },
];

const MAX = 2000;

/**
 * Global in-app feedback dialog. Opened from anywhere via the ui-store
 * (`openFeedback`). Submits to the workspace feedback endpoint.
 */
export function FeedbackDialog() {
  const open = useUiStore((s) => s.feedbackOpen);
  const setOpen = useUiStore((s) => s.setFeedbackOpen);
  const submit = useSubmitFeedback();

  const [type, setType] = React.useState<FeedbackType>("idea");
  const [rating, setRating] = React.useState(0);
  const [message, setMessage] = React.useState("");

  // Reset the form whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setType("idea");
      setRating(0);
      setMessage("");
    }
  }, [open]);

  const canSend = message.trim().length > 0 && !submit.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    submit.mutate(
      { type, message: message.trim(), ...(rating > 0 ? { rating } : {}) },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar comentarios</DialogTitle>
          <DialogDescription>
            Cuéntanos qué te gusta o qué podríamos mejorar. Leemos todo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Type */}
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] font-medium transition-colors",
                    active
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line-soft bg-panel text-ink-muted hover:border-line-bright hover:text-ink",
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Optional rating */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">Valoración (opcional):</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
                  className="p-0.5 text-ink-faint transition-colors hover:text-state-warning"
                >
                  <Star
                    className={cn(
                      "size-5",
                      n <= rating ? "fill-state-warning text-state-warning" : "",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
              placeholder="Escribe tu comentario…"
              rows={4}
              autoFocus
            />
            <div className="mt-1 text-right text-[11px] text-ink-faint">
              {message.length}/{MAX}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!canSend}>
              <Send className="size-4" /> Enviar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
