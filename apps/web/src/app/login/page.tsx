import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackendNotice } from "@/components/auth/backend-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
      await login({ email, password });
      // Take the user to one of their workspaces; if they have none yet, guide
      // them through creating their first one.
      const target = useAuthStore.getState().memberships[0]?.workspaceSlug;
      navigate(target ? `/w/${target}/dashboard` : "/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo iniciar sesión.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Inicia sesión"
      subtitle="Accede a tu Business OS."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="text-brand font-medium hover:underline">
            Crear cuenta
          </Link>
        </>
      }
    >
      <BackendNotice />
      <form onSubmit={onSubmit} className="space-y-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link to="/forgot-password" className="text-ink-muted hover:text-brand text-xs">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <p className="border-state-danger/30 bg-state-danger/10 text-state-danger rounded-lg border px-3 py-2 text-xs">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}
