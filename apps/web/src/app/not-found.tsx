import Link from "next/link";
import { DEFAULT_WORKSPACE_SLUG } from "@nv/domain";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-violet text-white shadow-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h6l2-3 3 6 2-3h3" />
        </svg>
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-bright">Página no encontrada</h1>
        <p className="mt-1 text-sm text-ink-muted">La ruta que buscas no existe en NV Core.</p>
      </div>
      <Button asChild>
        <Link href={`/w/${DEFAULT_WORKSPACE_SLUG}/dashboard`}>Volver al Dashboard</Link>
      </Button>
    </div>
  );
}
