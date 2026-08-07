"use client";

import { ArrowRight, Check, Plug, Rocket, Send, Sparkles, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { OnboardingStepKey } from "@nv/domain";

import { useWorkspace } from "@/hooks/use-workspace";
import { useOnboarding } from "@/hooks/use-domain-data";
import { useDismissOnboarding } from "@/hooks/use-domain-mutations";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Static copy + navigation for each step; completion comes from the backend. */
const STEP_META: Record<
  OnboardingStepKey,
  { title: string; description: string; icon: LucideIcon; href: string; cta: string }
> = {
  connect: {
    title: "Conecta un canal",
    description: "Vincula WhatsApp, Instagram o Facebook para empezar a publicar.",
    icon: Plug,
    href: "conexiones",
    cta: "Conectar",
  },
  audience: {
    title: "Crea tu audiencia",
    description: "Importa tus contactos o crea un grupo de destinatarios.",
    icon: Users,
    href: "contactos",
    cta: "Añadir contactos",
  },
  content: {
    title: "Diseña tu contenido",
    description: "Crea tu primer post con el editor visual o genéralo con IA.",
    icon: Sparkles,
    href: "builder",
    cta: "Crear post",
  },
  publish: {
    title: "Publica tu primer post",
    description: "Prográmalo y publícalo de forma omnicanal desde el calendario.",
    icon: Send,
    href: "calendario",
    cta: "Publicar",
  },
};

/**
 * Guided first-value checklist for a new workspace. Step completion is derived
 * from real workspace data (backend); the card hides once the user dismisses it.
 * The first incomplete step is highlighted as the suggested next action.
 */
export function OnboardingChecklist() {
  const ws = useWorkspace();
  const { data, isLoading } = useOnboarding();
  const dismiss = useDismissOnboarding();

  // Nothing to show while loading, or once the user has dismissed the card.
  if (isLoading || !data || data.dismissed) return null;

  const firstPending = data.steps.find((s) => !s.done)?.key;
  const pct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{ background: `${ws.accent}22`, color: ws.accent }}
          >
            {data.allDone ? <Rocket className="size-5" /> : <Sparkles className="size-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-bright">
              {data.allDone ? "¡Todo listo! 🎉" : "Primeros pasos"}
            </h2>
            <p className="text-xs text-ink-muted">
              {data.allDone
                ? "Tu workspace está configurado y listo para crecer."
                : "Completa la configuración para publicar tu primer contenido."}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          aria-label="Ocultar guía de primeros pasos"
        >
          <X className="size-4" /> {data.allDone ? "Cerrar" : "Omitir"}
        </Button>
      </div>

      {/* Progress */}
      <div className="px-5 pt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-ink-muted">
            {data.completed} de {data.total} completados
          </span>
          <span className="tabular-nums text-ink-faint">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-high">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: ws.accent }}
          />
        </div>
      </div>

      {/* Steps */}
      <ul className="grid gap-2 p-4 sm:grid-cols-2">
        {data.steps.map((step) => {
          const meta = STEP_META[step.key];
          const Icon = step.done ? Check : meta.icon;
          const isNext = step.key === firstPending;
          return (
            <li
              key={step.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                step.done
                  ? "border-line-soft bg-panel-raised"
                  : isNext
                    ? "border-line-bright bg-panel-raised"
                    : "border-line-soft bg-panel-raised hover:border-line-bright",
              )}
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-lg"
                style={
                  step.done
                    ? { background: "#3FB95022", color: "#3FB950" }
                    : { background: `${ws.accent}22`, color: ws.accent }
                }
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-sm font-medium",
                    step.done ? "text-ink-muted line-through" : "text-ink",
                  )}
                >
                  {meta.title}
                </div>
                <div className="truncate text-xs text-ink-faint">{meta.description}</div>
              </div>
              {!step.done ? (
                <Button variant={isNext ? "default" : "secondary"} size="sm" asChild>
                  <a href={`/w/${ws.slug}/${meta.href}`}>
                    {meta.cta} <ArrowRight className="size-3.5" />
                  </a>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
