import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DEFAULT_LEGAL_URL } from "@nv/domain";

import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackendNotice } from "@/components/auth/backend-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

/** Legal page on the sales site; VITE_LEGAL_URL points it elsewhere. */
const LEGAL_URL = import.meta.env.VITE_LEGAL_URL || DEFAULT_LEGAL_URL;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Only same-app paths (an invite link sends people back to /join/…).
  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const register = useAuthStore((s) => s.register);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isBackendConfigured()) {
      setError("No hay backend configurado. Entra en modo demo desde el inicio.");
      return;
    }
    if (!accepted) {
      setError("Debes aceptar los Términos legales para crear tu cuenta.");
      return;
    }
    setSubmitting(true);
    try {
      await register({ name, email, password, acceptTerms: true });
      // New account: send them straight to the guided setup to create their first
      // workspace (unless a pending invitation already added them to one).
      const target = useAuthStore.getState().memberships[0]?.workspaceSlug;
      navigate(next ?? (target ? `/w/${target}/dashboard` : "/onboarding"), { replace: true });
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
          <Link to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-brand font-medium hover:underline">
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
        <label htmlFor="accept-terms" className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-muted">
          <input
            id="accept-terms"
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="accent-brand mt-0.5 size-4 shrink-0"
          />
          <span>
            Acepto los{" "}
            <a href={`${LEGAL_URL}#terminos`} target="_blank" rel="noopener noreferrer" className="text-brand font-medium hover:underline">
              Términos y condiciones
            </a>
            , la{" "}
            <a href={`${LEGAL_URL}#privacidad`} target="_blank" rel="noopener noreferrer" className="text-brand font-medium hover:underline">
              Política de privacidad
            </a>{" "}
            y la{" "}
            <a href={`${LEGAL_URL}#cookies`} target="_blank" rel="noopener noreferrer" className="text-brand font-medium hover:underline">
              Política de cookies
            </a>
            .
          </span>
        </label>
        {error ? (
          <p className="border-state-danger/30 bg-state-danger/10 text-state-danger rounded-lg border px-3 py-2 text-xs">
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
