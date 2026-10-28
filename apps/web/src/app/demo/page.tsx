import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { AuthShell } from "@/components/auth/auth-shell";
import { demoTarget } from "@/lib/demo";

/**
 * /demo — the link the website uses for «Ver demo»: opens the read-only
 * example brand right away, no account needed.
 */
export default function DemoPage() {
  const navigate = useNavigate();
  const startDemo = useAuthStore((s) => s.startDemo);
  const [error, setError] = React.useState<string | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    startDemo()
      .then(() => navigate(demoTarget(), { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error && err.message ? err.message : "La demo no está disponible ahora mismo."));
  }, [startDemo, navigate]);

  return (
    <AuthShell title="Demo de NV Marketing" subtitle="Una marca de ejemplo para conocer el panel.">
      {error ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">{error}</p>
          <Link to="/register" className="font-medium text-brand hover:underline">
            Crear mi cuenta gratis
          </Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Abriendo la demo…
        </p>
      )}
    </AuthShell>
  );
}
