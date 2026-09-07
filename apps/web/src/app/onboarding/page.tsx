import * as React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket } from "lucide-react";
import { WORKSPACE_KINDS, type WorkspaceKind } from "@nv/domain";

import { cn } from "@/lib/utils";
import { isBackendConfigured } from "@/lib/env";
import { useAuthStore } from "@/stores/auth-store";
import { useCreateWorkspace } from "@/hooks/use-domain-mutations";
import { KIND_META, WORKSPACE_ACCENTS } from "@/lib/workspace-kinds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const GOALS: { id: string; label: string }[] = [
  { id: "difusion", label: "Difundir por WhatsApp / Telegram" },
  { id: "leads", label: "Captar clientes con formularios" },
  { id: "ventas", label: "Vender y cobrar" },
  { id: "automatizar", label: "Automatizar seguimientos" },
  { id: "contenido", label: "Crear contenido con IA" },
  { id: "redes", label: "Publicar en redes sociales" },
];

const STEPS = ["Categoría", "Identidad", "Objetivos"] as const;

function Aurora() {
  return (
    <div className="nv-aurora" aria-hidden>
      <div className="nv-aurora__grid" />
      <span
        className="nv-orb"
        style={{
          width: 480,
          height: 480,
          top: "-8%",
          left: "-6%",
          background: "hsl(var(--brand-a))",
        }}
      />
      <span
        className="nv-orb"
        style={{
          width: 420,
          height: 420,
          bottom: "-10%",
          right: "-4%",
          background: "hsl(var(--brand-b))",
          animationDelay: "-6s",
          opacity: 0.4,
        }}
      />
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const backend = isBackendConfigured();
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const create = useCreateWorkspace();

  const [step, setStep] = React.useState(0);
  const [kind, setKind] = React.useState<WorkspaceKind>("creative");
  const [name, setName] = React.useState("");
  const [accent, setAccent] = React.useState(KIND_META.creative.accent);
  const [accentTouched, setAccentTouched] = React.useState(false);
  const [goals, setGoals] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (backend) void hydrate();
  }, [backend, hydrate]);

  if (backend && status === "unauthenticated") return <Navigate to="/login" replace />;

  function chooseKind(k: WorkspaceKind) {
    setKind(k);
    if (!accentTouched) setAccent(KIND_META[k].accent);
  }
  function toggleGoal(id: string) {
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  async function finish() {
    setError(null);
    try {
      const ws = await create.mutateAsync({
        name: name.trim(),
        kind,
        accent,
        tagline: KIND_META[kind].desc,
      });
      try {
        // Remember the chosen goals to personalize the dashboard later.
        localStorage.setItem(`nv.onboarding.${ws.slug}`, JSON.stringify({ goals }));
      } catch {
        /* ignore storage errors */
      }
      navigate(`/w/${ws.slug}/dashboard`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el workspace.");
    }
  }

  const canNext = step === 0 ? Boolean(kind) : step === 1 ? name.trim().length >= 2 : true;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="bg-canvas text-ink relative min-h-screen overflow-hidden">
      <Aurora />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10">
        {/* Progress */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border text-xs font-semibold transition-colors",
                  i < step
                    ? "border-brand bg-brand text-white"
                    : i === step
                      ? "border-brand/70 bg-brand/15 text-ink-bright"
                      : "border-line-soft text-ink-faint",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {i < STEPS.length - 1 ? (
                <span
                  className={cn("h-px w-8", i < step ? "bg-brand" : "bg-line-soft")}
                  aria-hidden
                />
              ) : null}
            </div>
          ))}
        </div>

        <div className="nv-panel p-6 shadow-2xl shadow-black/20 sm:p-8">
          {!backend ? (
            <div className="border-state-warning/30 bg-state-warning/10 text-state-warning rounded-lg border px-3 py-2 text-sm">
              Modo demo: conecta el backend para crear tu propio workspace.
            </div>
          ) : null}

          {/* Each step remounts (key) so the entrance animation replays. */}
          <div key={step} className="nv-rise">
            {step === 0 ? (
              <>
                <h1 className="font-display text-ink-bright text-2xl font-semibold">
                  ¿A qué se dedica tu espacio?
                </h1>
                <p className="text-ink-muted mt-1 text-sm">
                  Elige una categoría para personalizar tu workspace.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h1 className="font-display text-ink-bright text-2xl font-semibold">
                  Ponle nombre y color
                </h1>
                <p className="text-ink-muted mt-1 text-sm">Así identificarás tu espacio.</p>
                <div className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-name">Nombre del workspace</Label>
                    <Input
                      id="ob-name"
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Mi marca"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Color de tu marca</Label>
                    <div className="flex flex-wrap gap-2">
                      {WORKSPACE_ACCENTS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setAccent(c);
                            setAccentTouched(true);
                          }}
                          className={
                            "size-8 rounded-full border-2 transition-transform " +
                            (accent === c ? "border-ink scale-110" : "border-transparent")
                          }
                          style={{ background: c }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h1 className="font-display text-ink-bright text-2xl font-semibold">
                  ¿Qué quieres lograr primero?
                </h1>
                <p className="text-ink-muted mt-1 text-sm">
                  Elige una o varias. Adaptaremos tu inicio a ello.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {GOALS.map((g) => {
                    const selected = goals.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGoal(g.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                          selected
                            ? "border-brand/70 bg-brand/10 text-ink"
                            : "border-line-soft bg-panel-raised text-ink-muted hover:border-line-bright",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-md border",
                            selected ? "border-brand bg-brand text-white" : "border-line-strong",
                          )}
                        >
                          {selected ? <Check className="size-3.5" /> : null}
                        </span>
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          {error ? (
            <p className="border-state-danger/30 bg-state-danger/10 text-state-danger mt-4 rounded-lg border px-3 py-2 text-xs">
              {error}
            </p>
          ) : null}

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || create.isPending}
            >
              <ArrowLeft className="size-4" /> Atrás
            </Button>
            {isLast ? (
              <Button type="button" onClick={finish} disabled={!backend || create.isPending}>
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Rocket className="size-4" />
                )}
                Crear mi workspace
              </Button>
            ) : (
              <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Continuar <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
