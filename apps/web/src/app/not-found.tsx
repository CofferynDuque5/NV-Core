import { useEffect } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/shell/brand-mark";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Página 404. Con sesión lleva al inicio de tu primera marca; sin sesión no
 * manda a un Dashboard que pediría login de todos modos: ofrece «Ingresar».
 */
export default function NotFound() {
  const status = useAuthStore((s) => s.status);
  const memberships = useAuthStore((s) => s.memberships);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Esta ruta vive fuera del AuthGate: si nadie restauró la sesión aún, hazlo aquí.
  useEffect(() => {
    if (status === "idle") void hydrate();
  }, [status, hydrate]);

  const home = memberships[0] ? `/w/${memberships[0].workspaceSlug}/dashboard` : null;
  const signedIn = status === "authenticated" && home !== null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-violet text-white shadow-brand">
        <BrandMark size={22} />
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-bright">Página no encontrada</h1>
        <p className="mt-1 text-sm text-ink-muted">La ruta que buscas no existe en NV Marketing.</p>
      </div>
      {status === "loading" || status === "idle" ? (
        <Button disabled>Un momento…</Button>
      ) : signedIn ? (
        <Button asChild>
          <Link to={home}>Ir al inicio</Link>
        </Button>
      ) : (
        <Button asChild>
          <Link to="/login">Ingresar</Link>
        </Button>
      )}
    </div>
  );
}
