
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_WORKSPACE_SLUG, WORKSPACES } from "@nv/domain";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackendNotice } from "@/components/auth/backend-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [workspaceSlug, setWorkspaceSlug] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isBackendConfigured()) {
      setError("No hay backend configurado. Entra en modo demo desde el inicio.");
      return;
    }
    setSubmitting(true);
    try {
      await register({
        name,
        email,
        password,
        workspaceSlug: workspaceSlug || undefined,
      });
      const target = useAuthStore.getState().memberships[0]?.workspaceSlug ?? DEFAULT_WORKSPACE_SLUG;
      navigate(`/w/${target}/dashboard`, { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo crear la cuenta.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Empieza tu Business OS en minutos."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <BackendNotice />
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workspace">Workspace a reclamar (opcional)</Label>
          <select
            id="workspace"
            value={workspaceSlug}
            onChange={(e) => setWorkspaceSlug(e.target.value)}
            className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            <option value="">Ninguno por ahora</option>
            {WORKSPACES.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-faint">
            Si el workspace aún no tiene dueño, te conviertes en Owner.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  );
}
