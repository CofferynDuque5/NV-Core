"use client";

import * as React from "react";

import { useCreateAutomation } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AutomationCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useCreateAutomation();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<"activo" | "pausado">("pausado");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setStatus("pausado");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      { name: name.trim(), description: description.trim() || undefined, status },
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
      title="Nuevo flujo"
      description="Crea una automatización. Los nodos (trigger, acciones…) se editarán después."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear flujo"
    >
      <div className="space-y-1.5">
        <Label htmlFor="au-name">Nombre</Label>
        <Input
          id="au-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Compra → onboarding"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="au-desc">Descripción</Label>
        <Textarea
          id="au-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qué hace este flujo…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="au-status">Estado inicial</Label>
        <select
          id="au-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "activo" | "pausado")}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          <option value="pausado">Pausado</option>
          <option value="activo">Activo</option>
        </select>
      </div>
    </FormDialog>
  );
}
