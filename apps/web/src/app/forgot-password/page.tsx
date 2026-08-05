
import * as React from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { authClient, AuthError } from "@/services/auth-client";
import { isBackendConfigured } from "@/lib/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackendNotice } from "@/components/auth/backend-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isBackendConfigured()) {
      setError("No hay backend configurado.");
      return;
    }
    setSubmitting(true);
    try {
      await authClient.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "No se pudo enviar el correo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Restablecer contraseña"
      subtitle="Te enviaremos un enlace para crear una nueva."
      footer={
        <Link to="/login" className="font-medium text-brand hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      <BackendNotice />
      {sent ? (
        <p className="rounded-lg border border-state-success/30 bg-state-success/10 px-3 py-2 text-sm text-state-success">
          Si existe una cuenta con ese email, te enviamos un enlace para restablecer la contraseña.
        </p>
      ) : (
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
          {error ? (
            <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
