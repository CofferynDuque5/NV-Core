"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { authClient } from "@/services/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";

type State = "verifying" | "ok" | "error";

export default function VerifyEmailPage() {
  const [state, setState] = React.useState<State>("verifying");

  React.useEffect(() => {
    const token = new URL(window.location.href).searchParams.get("token");
    if (!token) {
      setState("error");
      return;
    }
    authClient
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, []);

  return (
    <AuthShell
      title="Verificación de email"
      subtitle="Confirmando tu dirección de correo."
      footer={
        <Link href="/login" className="font-medium text-brand hover:underline">
          Ir a iniciar sesión
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        {state === "verifying" ? (
          <>
            <Loader2 className="size-8 animate-spin text-ink-muted" />
            <p className="text-sm text-ink-muted">Verificando…</p>
          </>
        ) : state === "ok" ? (
          <>
            <CheckCircle2 className="size-8 text-state-success" />
            <p className="text-sm text-ink">¡Email verificado! Ya puedes usar tu cuenta.</p>
          </>
        ) : (
          <>
            <XCircle className="size-8 text-state-danger" />
            <p className="text-sm text-ink">
              El enlace no es válido o expiró. Solicita uno nuevo desde la app.
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
