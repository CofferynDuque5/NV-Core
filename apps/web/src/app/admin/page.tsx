import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Loader2, Trash2, UserCog } from "lucide-react";
import { ROLES, type Role } from "@nv/domain";
import { toast } from "sonner";

import { useServices } from "@/hooks/use-services";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Platform super-admin panel (global, not workspace-scoped). Lists every user
 * and lets a super-admin assign/change/remove their role in any workspace.
 * Guarded server-side by SuperAdminGuard; hidden client-side for non-admins.
 */
export default function AdminPage() {
  const svc = useServices();
  const qc = useQueryClient();
  const superAdmin = useAuthStore((s) => s.superAdmin);
  const status = useAuthStore((s) => s.status);

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => svc.admin.users(), enabled: superAdmin });
  const workspaces = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => svc.admin.workspaces(),
    enabled: superAdmin,
  });

  const setMembership = useMutation({
    mutationFn: (input: { email: string; workspaceSlug: string; role: Role }) =>
      svc.admin.setMembership(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Rol asignado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo asignar"),
  });

  const removeMembership = useMutation({
    mutationFn: (v: { userId: string; workspaceSlug: string }) =>
      svc.admin.removeMembership(v.userId, v.workspaceSlug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Acceso quitado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo quitar"),
  });

  if (status !== "authenticated") {
    return <Centered>Inicia sesión para continuar.</Centered>;
  }
  if (!superAdmin) {
    return (
      <Centered>
        <ShieldCheck className="mb-3 size-8 text-ink-faint" />
        <p className="font-semibold text-ink">Solo para super-admin</p>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          Esta sección requiere ser super-admin de la plataforma (NV_SUPER_ADMINS / NV_ADMIN_EMAIL).
        </p>
        <Link to="/" className="mt-4 text-sm text-brand hover:underline">
          ← Volver al panel
        </Link>
      </Centered>
    );
  }

  const wsList = workspaces.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-brand/15 text-brand">
          <UserCog className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-ink-bright">Admin general</h1>
          <p className="text-sm text-ink-muted">
            Controla a todos los usuarios y sus roles en cualquier workspace.
          </p>
        </div>
        <Link to="/" className="ml-auto text-sm text-ink-muted hover:text-ink hover:underline">
          ← Volver al panel
        </Link>
      </header>

      {users.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Cargando usuarios…
        </div>
      ) : (
        <div className="space-y-3">
          {(users.data ?? []).map((u) => (
            <div key={u.id} className="nv-panel space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-bright">{u.name || u.email}</p>
                  <p className="truncate text-xs text-ink-muted">{u.email}</p>
                </div>
              </div>

              {u.memberships.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {u.memberships.map((m) => (
                    <span
                      key={`${m.workspaceSlug}-${m.role}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-panel-raised px-2.5 py-1 text-xs text-ink"
                    >
                      <b className="font-medium">{m.workspaceSlug}</b>
                      <span className="text-ink-muted">· {m.role}</span>
                      <button
                        type="button"
                        onClick={() => removeMembership.mutate({ userId: u.id, workspaceSlug: m.workspaceSlug })}
                        className="text-ink-faint hover:text-state-danger"
                        title="Quitar acceso"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-faint">Sin acceso a ningún workspace.</p>
              )}

              <AssignRow
                email={u.email}
                workspaces={wsList.map((w) => w.slug)}
                pending={setMembership.isPending}
                onAssign={(workspaceSlug, role) => setMembership.mutate({ email: u.email, workspaceSlug, role })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignRow({
  email,
  workspaces,
  pending,
  onAssign,
}: {
  email: string;
  workspaces: string[];
  pending: boolean;
  onAssign: (workspaceSlug: string, role: Role) => void;
}) {
  const [workspaceSlug, setWorkspaceSlug] = React.useState(workspaces[0] ?? "");
  const [role, setRole] = React.useState<Role>("Editor");
  const selectClass =
    "h-9 rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none";

  React.useEffect(() => {
    if (!workspaceSlug && workspaces[0]) setWorkspaceSlug(workspaces[0]);
  }, [workspaces, workspaceSlug]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
      <span className="text-xs text-ink-faint">Asignar acceso:</span>
      <select value={workspaceSlug} onChange={(e) => setWorkspaceSlug(e.target.value)} className={selectClass}>
        {workspaces.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectClass}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <Input type="hidden" value={email} readOnly className="hidden" />
      <Button
        size="sm"
        disabled={pending || !workspaceSlug}
        onClick={() => onAssign(workspaceSlug, role)}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Aplicar
      </Button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
