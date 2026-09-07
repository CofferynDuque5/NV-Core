import * as React from "react";
import { useNavigate } from "react-router-dom";
import { WORKSPACE_KINDS, type WorkspaceKind } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useCreateWorkspace } from "@/hooks/use-domain-mutations";
import { KIND_META, WORKSPACE_ACCENTS as ACCENTS } from "@/lib/workspace-kinds";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [accent, setAccent] = React.useState(KIND_META.creative.accent);
  const [accentTouched, setAccentTouched] = React.useState(false);
  const [tagline, setTagline] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setKind("creative");
    setAccent(KIND_META.creative.accent);
    setAccentTouched(false);
    setTagline("");
    setError(null);
  }

  /** Pick a category — also adopts its suggested accent unless the user set one. */
  function chooseKind(k: WorkspaceKind) {
    setKind(k);
    if (!accentTouched) setAccent(KIND_META[k].accent);
  }

  function submit() {
    setError(null);
    // Smart default: if no tagline was typed, use the category's description so
    // the new space is personalized from the chosen vertical.
    const finalTagline = tagline.trim() || KIND_META[kind].desc;
    mutation.mutate(
      { name: name.trim(), kind, accent, tagline: finalTagline },
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
      title="Crea tu workspace"
      description="Elige una categoría para personalizar el espacio y ponle nombre."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      size="lg"
      submitLabel="Crear workspace"
    >
      {/* Category gallery */}
      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WORKSPACE_KINDS.map((k) => {
            const meta = KIND_META[k];
            const Icon = meta.icon;
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => chooseKind(k)}
                aria-pressed={selected}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                  selected
                    ? "border-brand/70 bg-brand/10"
                    : "border-line-soft bg-panel-raised hover:border-line-bright",
                )}
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-white"
                  style={{ background: meta.accent }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="text-ink block text-sm font-medium">{meta.label}</span>
                  <span className="text-ink-faint block text-[11px] leading-tight">
                    {meta.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setAccent(c);
                setAccentTouched(true);
              }}
              className={
                "size-7 rounded-full border-2 transition-transform " +
                (accent === c ? "border-ink scale-110" : "border-transparent")
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
