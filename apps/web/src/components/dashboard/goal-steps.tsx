import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Target } from "lucide-react";
import { WORKSPACE_GOALS } from "@nv/domain";

import { useWorkspace } from "@/hooks/use-workspace";
import { useUpdateWorkspace } from "@/hooks/use-domain-mutations";
import { useAuthStore } from "@/stores/auth-store";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Goals a brand saved in this browser before goals were stored on the brand. */
function legacyGoals(slug: string): string[] {
  try {
    const raw = localStorage.getItem(`nv.onboarding.${slug}`);
    const goals = raw ? (JSON.parse(raw) as { goals?: unknown }).goals : null;
    return Array.isArray(goals) ? goals.filter((g): g is string => typeof g === "string") : [];
  } catch {
    return [];
  }
}

/** Next steps for the brand's goals: the user's answer to «¿Qué quieres lograr primero?». */
export function goalSteps(goals: readonly string[]) {
  return goals.flatMap((id) => {
    const g = WORKSPACE_GOALS.find((x) => x.id === id);
    return g ? g.steps.map((s) => ({ ...s, goal: g.label })) : [];
  });
}

/**
 * Dashboard card driven by the brand's goals. Without goals it asks the
 * question right here (Owner/Admin), and the menu reorders as soon as one is picked.
 */
export function GoalSteps() {
  const ws = useWorkspace();
  const update = useUpdateWorkspace();
  const role = useAuthStore((s) => s.memberships.find((m) => m.workspaceSlug === ws.slug)?.role);
  const canEdit = role === "Owner" || role === "Admin";
  const goals = ws.goals ?? [];
  const [picked, setPicked] = React.useState<string[]>([]);

  // Brands created before goals lived on the brand: move them over once.
  const migrated = React.useRef(false);
  React.useEffect(() => {
    if (migrated.current || !canEdit || ws.goals === undefined || goals.length > 0) return;
    const old = legacyGoals(ws.slug).filter((g) => WORKSPACE_GOALS.some((x) => x.id === g));
    if (old.length === 0) return;
    migrated.current = true;
    update.mutate({ goals: old });
  }, [canEdit, goals.length, update, ws.goals, ws.slug]);

  if (goals.length === 0) {
    if (!canEdit) return null;
    return (
      <Panel className="p-5" data-testid="goal-picker">
        <div className="flex items-start gap-3">
          <span className="bg-brand/15 text-brand grid size-10 shrink-0 place-items-center rounded-xl">
            <Target className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-ink-bright text-sm font-semibold">
                ¿Qué quieres lograr primero?
              </h2>
              <p className="text-ink-muted text-xs">
                Ordenamos tu menú y tus próximos pasos según lo que elijas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {WORKSPACE_GOALS.map((g) => {
                const on = picked.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((p) => (on ? p.filter((x) => x !== g.id) : [...p, g.id]))
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      on
                        ? "border-brand/60 bg-brand/10 text-ink"
                        : "border-line-soft text-ink-muted hover:border-line-bright",
                    )}
                  >
                    {on ? <Check className="size-3.5" /> : null}
                    {g.label}
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              disabled={picked.length === 0 || update.isPending}
              onClick={() => update.mutate({ goals: picked })}
            >
              Personalizar mi panel
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  const steps = goalSteps(goals).slice(0, 6);
  const labels = goals.map((id) => WORKSPACE_GOALS.find((g) => g.id === id)?.label).filter(Boolean);
  return (
    <Panel className="p-5" data-testid="goal-steps">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="bg-brand/15 text-brand grid size-10 shrink-0 place-items-center rounded-xl">
            <Target className="size-5" />
          </span>
          <div>
            <h2 className="text-ink-bright text-sm font-semibold">
              Tu objetivo: {labels.join(" · ")}
            </h2>
            <p className="text-ink-muted text-xs">
              Tus próximos pasos. El menú ya muestra primero lo que necesitas.
            </p>
          </div>
        </div>
        {canEdit ? (
          <Link
            to={`/w/${ws.slug}/configuracion?tab=marca`}
            className="text-brand text-xs hover:underline"
          >
            Cambiar objetivo
          </Link>
        ) : null}
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((s, i) => (
          <li key={`${s.href}-${i}`}>
            <Link
              to={`/w/${ws.slug}/${s.href}`}
              className="border-line-soft bg-panel-raised hover:border-brand/50 group flex h-full items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
            >
              <span className="bg-brand/15 text-brand grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                {i + 1}
              </span>
              <span className="text-ink min-w-0 flex-1 text-sm">{s.title}</span>
              <span className="text-ink-muted group-hover:text-ink flex shrink-0 items-center gap-1 text-xs">
                {s.cta} <ArrowRight className="size-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
