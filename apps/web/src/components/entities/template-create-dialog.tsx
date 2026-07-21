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
          placeholder="Hola {nombre} 👋 …"
          className="min-h-[120px]"
        />
      </div>
    </FormDialog>
  );
}
