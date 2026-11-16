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

  // Keep search engines from indexing a mistyped address.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const home = memberships[0] ? `/w/${memberships[0].workspaceSlug}/dashboard` : null;
  const signedIn = status === "authenticated" && home !== null;

  return (
    <div className="bg-canvas flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="from-brand to-brand-violet shadow-brand grid size-12 place-items-center rounded-xl bg-gradient-to-br text-white">
        <BrandMark size={22} />
      </div>
      <div>
        <h1 className="font-display text-ink-bright text-2xl font-semibold">
          Página no encontrada
        </h1>
        <p className="text-ink-muted mt-1 text-sm">La ruta que buscas no existe en NV Marketing.</p>
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
