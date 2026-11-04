import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * While the session is restored, show the panel's frame (sidebar, top bar,
 * page blocks) instead of a blank «Cargando…»: it reads as the panel opening,
 * and nothing jumps when the real one replaces it.
 */
function ShellSkeleton() {
  const bar = "rounded-md bg-line/60 animate-pulse";
  return (
    <div
      className="bg-canvas flex min-h-screen"
      role="status"
      aria-live="polite"
      aria-label="Cargando NV Marketing"
    >
      <aside className="border-line hidden w-60 shrink-0 flex-col gap-3 border-r p-4 md:flex">
        <div className={cn(bar, "h-9 w-36")} />
        <div className={cn(bar, "mt-2 h-12 w-full")} />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className={cn(bar, "h-7")} style={{ width: `${60 + ((i * 17) % 35)}%` }} />
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-line flex h-14 items-center gap-3 border-b px-4">
          <div className={cn(bar, "h-9 w-full max-w-md")} />
          <div className="ml-auto flex gap-2">
            <div className={cn(bar, "size-9")} />
            <div className={cn(bar, "size-9 rounded-full")} />
          </div>
        </div>
        <main className="space-y-4 p-6">
          <div className={cn(bar, "h-4 w-32")} />
          <div className={cn(bar, "h-8 w-64")} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={cn(bar, "h-24")} />
            ))}
          </div>
          <div className={cn(bar, "h-64")} />
          <span className="sr-only">Cargando NV Marketing…</span>
        </main>
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
  const location = useLocation();
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
      // Come back to this page after signing in again.
      const next = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
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
  }, [
    backend,
    status,
    memberships,
    params?.workspace,
    navigate,
    location.pathname,
    location.search,
  ]);

  if (!backend) return <>{children}</>;
  if (status !== "authenticated") return <ShellSkeleton />;
  return <>{children}</>;
}
