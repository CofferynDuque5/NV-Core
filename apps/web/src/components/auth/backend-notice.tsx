import { isBackendConfigured } from "@/lib/env";

/** Shown on auth pages when no backend is configured (demo mode). */
export function BackendNotice() {
  if (isBackendConfigured()) return null;
  return (
    <div className="mb-4 rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
      Modo demo: no hay backend configurado. Define{" "}
      <code className="rounded bg-black/20 px-1">NEXT_PUBLIC_API_URL</code> para habilitar el login
      real. Puedes entrar sin autenticación desde el inicio.
    </div>
  );
}
