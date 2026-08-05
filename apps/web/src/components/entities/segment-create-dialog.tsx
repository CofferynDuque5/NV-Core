
import * as React from "react";

import { useCreateSegment } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SegmentCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useCreateSegment();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#5B8DEF");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setColor("#5B8DEF");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      { name: name.trim(), color },
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
      title="Nuevo segmento"
      description="Define una audiencia dinámica."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear segmento"
    >
      <div className="space-y-1.5">
        <Label htmlFor="sg-name">Nombre</Label>
        <Input id="sg-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sg-color">Color</Label>
        <div className="flex items-center gap-2">
          <input
            id="sg-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-lg border border-line-soft bg-panel-raised"
          />
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="max-w-[120px]" />
        </div>
      </div>
      <p className="text-xs text-ink-faint">
        Las reglas de segmentación (servicio, estado, actividad…) se editarán en el detalle.
      </p>
    </FormDialog>
  );
}
