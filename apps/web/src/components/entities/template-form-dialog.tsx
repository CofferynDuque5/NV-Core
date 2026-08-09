
import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { Template } from "@nv/domain";

import { useCreateTemplate, useUpdateTemplate } from "@/hooks/use-domain-mutations";
import { useImproveMessage } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template?: Template | null;
}) {
  const isEdit = Boolean(template);
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const improve = useImproveMessage();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setCategory(template?.category ?? "");
    setBody(template?.body ?? "");
    setError(null);
  }, [open, template]);

  async function improveWithAI() {
    const base = body.trim();
    if (!base) {
      setError("Escribe un texto para que la IA lo mejore.");
      return;
    }
    setError(null);
    try {
      const res = await improve.mutateAsync(base);
      if (res?.text) setBody(res.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mejorar con IA.");
    }
  }

  function submit() {
    setError(null);
    const input = {
      name: name.trim(),
      category: category.trim() || undefined,
      body: body.trim(),
    };
    const opts = {
      onSuccess: () => onOpenChange(false),
      onError: (err: unknown) => setError(errorMessage(err)),
    };
    if (template) update.mutate({ id: template.id, input }, opts);
    else create.mutate(input, opts);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar plantilla" : "Nueva plantilla"}
      description="Guarda un mensaje reutilizable con variables."
      onSubmit={submit}
      pending={pending}
      error={error}
      size="lg"
      submitLabel={isEdit ? "Guardar cambios" : "Crear plantilla"}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">Nombre</Label>
          <Input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-cat">Categoría</Label>
          <Input
            id="t-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Bienvenida"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="t-body">Mensaje</Label>
          <button
            type="button"
            onClick={improveWithAI}
            disabled={improve.isPending}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-line-soft px-2 text-xs text-ink-muted transition-colors hover:border-brand/60 hover:text-ink disabled:opacity-60"
            title="Mejorar el texto con IA"
          >
            {improve.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Mejorar con IA
          </button>
        </div>
        <Textarea
          id="t-body"
          required
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hola {{grupo}} 👋, tu cita es el {{fecha}} a las {{hora}}."
          className="min-h-[140px]"
        />
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
          <span>Insertar variable:</span>
          {["grupo", "fecha", "hora"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBody((b) => `${b}{{${v}}}`)}
              className="rounded-full border border-line-soft px-2 py-0.5 text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
            >
              {`{{${v}}}`}
            </button>
          ))}
          <span>· o cualquier variable por grupo.</span>
        </div>
      </div>
    </FormDialog>
  );
}
