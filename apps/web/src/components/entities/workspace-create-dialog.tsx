import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Clapperboard,
  Code2,
  Dumbbell,
  HeartPulse,
  Megaphone,
  Palette,
  PenTool,
  Plane,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { WORKSPACE_KINDS, type WorkspaceKind } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useCreateWorkspace } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Category metadata: label, one-line description, brand accent and icon. */
const KIND_META: Record<
  WorkspaceKind,
  { label: string; desc: string; accent: string; icon: LucideIcon }
> = {
  creative: {
    label: "Creativo",
    desc: "Agencia o estudio creativo",
    accent: "#5B8DEF",
    icon: Palette,
  },
  software: {
    label: "Software",
    desc: "Producto o estudio de software",
    accent: "#7C7CF0",
    icon: Code2,
  },
  health: {
    label: "Salud",
    desc: "Clínica, salud o bienestar",
    accent: "#3FB950",
    icon: HeartPulse,
  },
  design: {
    label: "Diseño",
    desc: "Diseño gráfico y de producto",
    accent: "#E1306C",
    icon: PenTool,
  },
  tourism: {
    label: "Turismo",
    desc: "Viajes, turismo y hospedaje",
    accent: "#229ED9",
    icon: Plane,
  },
  ecommerce: {
    label: "E-commerce",
    desc: "Tienda online y ventas",
    accent: "#E3B341",
    icon: ShoppingBag,
  },
  marketing: {
    label: "Marketing",
    desc: "Agencia o equipo de marketing",
    accent: "#F85149",
    icon: Megaphone,
  },
  ai: { label: "IA", desc: "Producto o servicio de IA", accent: "#7C7CF0", icon: Sparkles },
  fitness: {
    label: "Fitness",
    desc: "Gimnasio, coaching y fitness",
    accent: "#3FB950",
    icon: Dumbbell,
  },
  security: {
    label: "Seguridad",
    desc: "Seguridad y vigilancia",
    accent: "#F85149",
    icon: ShieldCheck,
  },
  streaming: { label: "Streaming", desc: "Streaming y creadores", accent: "#E1306C", icon: Radio },
  media: {
    label: "Media",
    desc: "Medios, prensa y contenido",
    accent: "#5B8DEF",
    icon: Clapperboard,
  },
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
