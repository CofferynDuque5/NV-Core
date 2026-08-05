import * as React from "react";
import { useNavigate } from "react-router-dom";
import { WORKSPACE_KINDS, type WorkspaceKind } from "@nv/domain";

import { useCreateWorkspace } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const KIND_LABELS: Record<WorkspaceKind, string> = {
  creative: "Creativo",
  software: "Software",
  health: "Salud",
  design: "Diseño",
  tourism: "Turismo",
  ecommerce: "E-commerce",
  marketing: "Marketing",
  ai: "IA",
  fitness: "Fitness",
  security: "Seguridad",
  streaming: "Streaming",
  media: "Media",
};

const ACCENTS = ["#5B8DEF", "#7C7CF0", "#3FB950", "#E3B341", "#F85149", "#E1306C", "#229ED9"];

export function WorkspaceCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const mutation = useCreateWorkspace();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<WorkspaceKind>("creative");
  const [accent, setAccent] = React.useState(ACCENTS[0]!);
  const [tagline, setTagline] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setKind("creative");
    setAccent(ACCENTS[0]!);
    setTagline("");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      { name: name.trim(), kind, accent, tagline: tagline.trim() || undefined },
      {
        onSuccess: (ws) => {
          reset();
          onOpenChange(false);
          navigate(`/w/${ws.slug}/dashboard`);
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
      title="Crear workspace"
      description="Una nueva marca o proyecto con el Core completo."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear workspace"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Nombre</Label>
        <Input
          id="ws-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mi nueva marca"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ws-kind">Tipo</Label>
        <select
          id="ws-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as WorkspaceKind)}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          {WORKSPACE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAccent(c)}
              className={
                "size-7 rounded-full border-2 transition-transform " +
                (accent === c ? "scale-110 border-ink" : "border-transparent")
              }
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ws-tagline">
          Tagline <span className="text-ink-faint">· opcional</span>
        </Label>
        <Input
          id="ws-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Agencia creativa, tienda, etc."
        />
      </div>
    </FormDialog>
  );
}
