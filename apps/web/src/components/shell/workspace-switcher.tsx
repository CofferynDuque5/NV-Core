"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspace, useWorkspaces } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { WorkspaceCreateDialog } from "@/components/entities/workspace-create-dialog";
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
  const router = useRouter();
  const active = useWorkspace();
  const workspaces = useWorkspaces();
  const memberships = useAuthStore((s) => s.memberships);
  const [createOpen, setCreateOpen] = React.useState(false);

  // When authenticated with memberships, show only accessible workspaces.
  const visible =
    memberships.length > 0
      ? workspaces.filter((w) => memberships.some((m) => m.workspaceSlug === w.slug))
      : workspaces;

  function go(slug: string) {
    router.push(`/w/${slug}/dashboard`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
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
                    <span className="truncate text-sm font-semibold text-ink-bright">{w.name}</span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">
                        <Check className="size-2.5" /> Actual
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {w.enabledModules.length} módulos + Core
                  </span>
                </span>
                <ArrowRight
                  className={cn(
                    "size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-muted",
                  )}
                />
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            onOpenChange(false);
            setCreateOpen(true);
          }}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand/50 hover:text-brand"
        >
          <Plus className="size-4" /> Crear workspace
        </button>
      </DialogContent>

      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Dialog>
  );
}
