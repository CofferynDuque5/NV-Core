import * as React from "react";
import type { QuickReply } from "@nv/domain";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { useQuickReplies } from "@/hooks/use-domain-data";
import { useSaveQuickReplies } from "@/hooks/use-domain-mutations";
import { EXAMPLE_REPLIES, REPLY_VARS } from "@/lib/inbox";
import { FormDialog, errorMessage } from "@/components/entities/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MAX = 50;
const newId = () => `qr_${Math.random().toString(36).slice(2, 10)}`;

/** Saved replies whose title or text match what was typed after «/». */
export function matchReplies(items: QuickReply[], q: string): QuickReply[] {
  const s = q.trim().toLowerCase();
  if (!s) return items.slice(0, 8);
  return items
    .filter((r) => r.title.toLowerCase().includes(s) || r.text.toLowerCase().includes(s))
    .slice(0, 8);
}

/** Edit the brand's saved replies (title + text with variables). */
export function QuickRepliesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const list = useQuickReplies();
  const save = useSaveQuickReplies();
  const [items, setItems] = React.useState<QuickReply[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setItems(list.data ?? []);
    setError(null);
  }, [open, list.data]);

  const set = (i: number, patch: Partial<QuickReply>) =>
    setItems((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit() {
    const clean = items.map((r) => ({ ...r, title: r.title.trim(), text: r.text.trim() }));
    if (clean.some((r) => !r.title || !r.text)) {
      setError("Cada respuesta necesita un nombre y un texto.");
      return;
    }
    save.mutate(clean, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => setError(errorMessage(err)),
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Respuestas guardadas"
      description="Textos que usas a diario. En el chat escribe «/» o pulsa «Respuestas» para insertarlos; las variables se llenan con los datos del cliente."
      onSubmit={submit}
      pending={save.isPending}
      error={error}
      size="lg"
    >
      <p className="text-ink-faint text-[11px]">
        Variables: {REPLY_VARS.map((v) => (
          <code key={v} className="text-ink-muted mr-1.5">{v}</code>
        ))}
      </p>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1" data-testid="quick-replies-editor">
        {items.length === 0 ? (
          <div className="border-line-soft rounded-lg border border-dashed p-4 text-center">
            <p className="text-ink-muted text-sm">Todavía no tienes respuestas guardadas.</p>
            <button
              type="button"
              onClick={() => setItems(EXAMPLE_REPLIES.map((r) => ({ ...r, id: newId() })))}
              className="text-brand mt-2 inline-flex items-center gap-1 text-xs font-medium"
              data-testid="quick-replies-examples"
            >
              <Sparkles className="size-3.5" /> Empezar con 4 ejemplos
            </button>
          </div>
        ) : (
          items.map((r, i) => (
            <div key={r.id} className="border-line-soft bg-panel-raised space-y-1.5 rounded-lg border p-2.5" data-testid="quick-reply-row">
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label={`Nombre de la respuesta ${i + 1}`}
                  value={r.title}
                  maxLength={60}
                  onChange={(e) => set(i, { title: e.target.value })}
                  placeholder="Nombre corto (p. ej. Precios)"
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  aria-label="Quitar respuesta"
                  onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}
                  className="text-state-danger hover:bg-state-danger/10 rounded p-1.5"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <Textarea
                aria-label={`Texto de la respuesta ${i + 1}`}
                value={r.text}
                rows={2}
                maxLength={2000}
                onChange={(e) => set(i, { text: e.target.value })}
                placeholder="Hola {{nombre}}, …"
                className="text-xs"
              />
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        disabled={items.length >= MAX}
        onClick={() => setItems((cur) => [...cur, { id: newId(), title: "", text: "" }])}
        className="border-line-soft text-ink-muted hover:border-brand/60 hover:text-ink inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
        data-testid="quick-reply-add"
      >
        <Plus className="size-3.5" /> Nueva respuesta
      </button>
    </FormDialog>
  );
}
