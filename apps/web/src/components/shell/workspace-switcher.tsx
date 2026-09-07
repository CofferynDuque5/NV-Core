import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { isBackendConfigured } from "@/lib/env";
import { useWorkspace, useWorkspaces } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function WorkspaceSwitcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const active = useWorkspace();
  const workspaces = useWorkspaces();
  const memberships = useAuthStore((s) => s.memberships);

  // With a real backend, only ever show the workspaces this user belongs to
  // (never the built-in demo list). Demo mode shows whatever the store holds.
  const visible = isBackendConfigured()
    ? workspaces.filter((w) => memberships.some((m) => m.workspaceSlug === w.slug))
    : workspaces;

  function go(slug: string) {
    navigate(`/w/${slug}/dashboard`);
    onOpenChange(false);
  }

  function createWorkspace() {
    onOpenChange(false);
    navigate("/onboarding");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <p className="text-ink-faint text-[11px] font-semibold uppercase tracking-[0.2em]">
            Business Operating System
          </p>
          <DialogTitle className="font-display text-xl">Elige tu workspace</DialogTitle>
          <DialogDescription>
            Cada empresa comparte el mismo Core y suma sus módulos especializados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {visible.map((w) => {
            const isActive = w.id === active.id;
            return (
              <button
                key={w.id}
                onClick={() => go(w.slug)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                  isActive
                    ? "border-brand/50 bg-brand/8"
                    : "border-line-soft bg-panel hover:border-line-bright",
                )}
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-white"
                  style={{ background: w.accent }}
                >
                  {w.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-ink-bright truncate text-sm font-semibold">{w.name}</span>
                    {isActive ? (
                      <span className="bg-brand/15 text-brand inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase">
                        <Check className="size-2.5" /> Actual
                      </span>
                    ) : null}
                  </span>
                  <span className="text-ink-muted block truncate text-xs">
                    {w.enabledModules.length} módulos + Core
                  </span>
                </span>
                <ArrowRight
                  className={cn(
                    "text-ink-faint group-hover:text-ink-muted size-4 shrink-0 transition-transform group-hover:translate-x-0.5",
                  )}
                />
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <p className="text-ink-muted py-2 text-center text-sm">
            Aún no tienes workspaces. Crea el tuyo para empezar.
          </p>
        ) : null}

        <button
          onClick={createWorkspace}
          className="border-line-strong text-ink-muted hover:border-brand/50 hover:text-brand flex items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm font-medium transition-colors"
        >
          <Plus className="size-4" /> Crear workspace
        </button>
      </DialogContent>
    </Dialog>
  );
}
