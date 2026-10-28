import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { WORKSPACE_GOALS, WORKSPACE_KINDS, type WorkspaceKind } from "@nv/domain";

import { useWorkspace, useWorkspaces } from "@/hooks/use-workspace";
import { useDeleteWorkspace, useUpdateWorkspace } from "@/hooks/use-domain-mutations";
import { useAuthStore } from "@/stores/auth-store";
import { KIND_META, WORKSPACE_ACCENTS } from "@/lib/workspace-kinds";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

function DeleteBrand({ name, slug }: { name: string; slug: string }) {
  const remove = useDeleteWorkspace();
  const workspaces = useWorkspaces();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // mutateAsync: the shell may unmount this tab as soon as the brand is gone,
  // and per-call callbacks of an unmounted observer never run.
  const go = async () => {
    setError(null);
    const next = workspaces.find((w) => w.slug !== slug);
    try {
      await remove.mutateAsync({ slug, confirmName: typed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
      return;
    }
    setOpen(false);
    navigate(next ? `/w/${next.slug}/dashboard` : "/onboarding", { replace: true });
  };

  return (
    <Panel className="border-state-danger/40">
      <PanelHeader
        title="Eliminar marca"
        description="Borra la marca con todos sus contactos, campañas, grupos, productos, archivos y datos. No se puede deshacer."
      />
      <div className="p-5">
        <Button
          variant="ghost"
          className="text-state-danger hover:bg-state-danger/10"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" /> Eliminar «{name}»
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          setTyped("");
          setError(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-state-danger size-5" /> Eliminar «{name}»
            </DialogTitle>
            <DialogDescription>
              Se borra todo lo de esta marca para todo el equipo. Escribe su nombre para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Nombre de la marca"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={name}
          />
          {error ? <p className="text-state-danger text-sm">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-state-danger hover:bg-state-danger/90 text-white"
              disabled={typed.trim() !== name || remove.isPending}
              onClick={() => void go()}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar para siempre"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

/** Configuración → Marca: identity, «¿Qué quieres lograr primero?» and deletion. */
export function BrandTab() {
  const ws = useWorkspace();
  const update = useUpdateWorkspace();
  const role = useAuthStore((s) => s.memberships.find((m) => m.workspaceSlug === ws.slug)?.role);
  const canEdit = role === "Owner" || role === "Admin";
  const [name, setName] = React.useState(ws.name);
  const [tagline, setTagline] = React.useState(ws.tagline ?? "");
  const [kind, setKind] = React.useState<WorkspaceKind>(ws.kind);
  const [accent, setAccent] = React.useState(ws.accent);
  const [goals, setGoals] = React.useState<string[]>(ws.goals ?? []);

  React.useEffect(() => {
    setName(ws.name);
    setTagline(ws.tagline ?? "");
    setKind(ws.kind);
    setAccent(ws.accent);
    setGoals(ws.goals ?? []);
  }, [ws.name, ws.tagline, ws.kind, ws.accent, ws.goals]);

  const saveIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { name: name.trim(), tagline: tagline.trim(), kind, accent },
      { onSuccess: () => toast.success("Marca actualizada.") },
    );
  };
  const saveGoals = () =>
    update.mutate(
      { goals },
      { onSuccess: () => toast.success("Listo: tu menú y tu inicio siguen tus objetivos.") },
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Datos de la marca"
            description={
              ws.builtin
                ? "Marca de demostración: su nombre y color no se cambian."
                : "Nombre, tipo, color y descripción."
            }
          />
          <form className="space-y-4 p-5" onSubmit={saveIdentity}>
            <fieldset disabled={!canEdit || ws.builtin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="brand-name">Nombre</Label>
                <Input
                  id="brand-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={60}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-tagline">Descripción corta</Label>
                <Input
                  id="brand-tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-kind">Tipo de negocio</Label>
                <select
                  id="brand-kind"
                  className={selectCls}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as WorkspaceKind)}
                >
                  {WORKSPACE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_META[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label="Color de la marca"
                >
                  {WORKSPACE_ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={accent.toLowerCase() === c.toLowerCase()}
                      aria-label={c}
                      onClick={() => setAccent(c)}
                      className={cn(
                        "ring-offset-canvas grid size-8 place-items-center rounded-lg ring-offset-2 transition",
                        accent.toLowerCase() === c.toLowerCase() && "ring-ink ring-2",
                      )}
                      style={{ background: c }}
                    >
                      {accent.toLowerCase() === c.toLowerCase() ? (
                        <Check className="size-4 text-white" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={update.isPending || name.trim().length < 2}>
                Guardar marca
              </Button>
            </fieldset>
          </form>
        </Panel>

        <Panel>
          <PanelHeader
            title="¿Qué quieres lograr primero?"
            description="El menú muestra arriba lo que necesitas y el inicio te da los próximos pasos."
          />
          <div className="space-y-4 p-5">
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="group"
              aria-label="Objetivos"
            >
              {WORKSPACE_GOALS.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={on}
                    onClick={() =>
                      setGoals((p) => (on ? p.filter((x) => x !== g.id) : [...p, g.id]))
                    }
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                      on
                        ? "border-brand/70 bg-brand/10 text-ink"
                        : "border-line-soft bg-panel-raised text-ink-muted hover:border-line-bright",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md border",
                        on ? "border-brand bg-brand text-white" : "border-line-strong",
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                    {g.label}
                  </button>
                );
              })}
            </div>
            <Button onClick={saveGoals} disabled={!canEdit || update.isPending}>
              Guardar objetivos
            </Button>
          </div>
        </Panel>
      </div>
      {role === "Owner" && !ws.builtin ? <DeleteBrand name={ws.name} slug={ws.slug} /> : null}
    </div>
  );
}
