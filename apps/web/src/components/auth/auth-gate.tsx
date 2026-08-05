import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
        Cargando NV Core…
      </div>
    </div>
  );
}

/**
 * Session gate for the workspace shell.
 *
 * - Demo mode (no backend): renders children immediately — no auth required.
 * - Backend mode: restores the session, redirects unauthenticated users to
 *   /login, and steers members away from workspaces they don't belong to.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const params = useParams<{ workspace?: string }>();
  const status = useAuthStore((s) => s.status);
  const memberships = useAuthStore((s) => s.memberships);
  const hydrate = useAuthStore((s) => s.hydrate);

  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void hydrate();
  }, [hydrate]);

  const backend = isBackendConfigured();

  React.useEffect(() => {
    if (!backend) return;
    if (status === "unauthenticated") {
      navigate("/login", { replace: true });
      return;
    }
    // Authenticated but visiting a workspace they don't belong to → steer them
    // to one they do (if any).
    if (status === "authenticated" && params?.workspace && memberships.length > 0) {
      const isMember = memberships.some((m) => m.workspaceSlug === params.workspace);
      if (!isMember) {
        navigate(`/w/${memberships[0]!.workspaceSlug}/dashboard`, { replace: true });
      }
    }
  }, [backend, status, memberships, params?.workspace, navigate]);

  if (!backend) return <>{children}</>;
  if (status !== "authenticated") return <FullScreenLoader />;
  return <>{children}</>;
}
