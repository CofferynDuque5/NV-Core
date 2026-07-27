"use client";

import * as React from "react";

import { useCreateTemplate } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TemplateCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useCreateTemplate();
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setCategory("");
    setBody("");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      { name: name.trim(), category: category.trim() || undefined, body: body.trim() },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Nueva plantilla"
      description="Guarda un mensaje reutilizable."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear plantilla"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">Nombre</Label>
          <Input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-cat">Categoría</Label>
          <Input id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Bienvenida" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-body">Mensaje</Label>
        <Textarea
          id="t-body"
          required
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hola {{grupo}} 👋, tu cita es el {{fecha}} a las {{hora}}."
          className="min-h-[120px]"
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
