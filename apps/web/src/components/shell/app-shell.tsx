
import * as React from "react";
import { useParams } from "react-router-dom";
import { Lock } from "lucide-react";

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { Topbar } from "./topbar";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { CommandPalette } from "./command-palette";
import { NotificationsPanel } from "./notifications-panel";
import { ComposeWizard } from "@/components/overlays/compose-wizard";
import { EntityDrawer } from "@/components/overlays/entity-drawer";
import { FeedbackDialog } from "@/components/overlays/feedback-dialog";
import { TourOverlay } from "@/components/overlays/tour-overlay";
import { AuthGate } from "@/components/auth/auth-gate";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { useServices } from "@/hooks/use-services";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const services = useServices();
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const { workspace: routeSlug } = useParams<{ workspace?: string }>();
  const authStatus = useAuthStore((s) => s.status);
  const memberships = useAuthStore((s) => s.memberships);

  // A logged-in user who isn't a member of the workspace in the URL would get a
  // 403 on every data call ("Algo salió mal" everywhere). Show a clear access
  // message instead. Only applies with the real backend + once authenticated.
  const noAccess =
    isBackendConfigured() &&
    authStatus === "authenticated" &&
    Boolean(routeSlug) &&
    !memberships.some((m) => m.workspaceSlug === routeSlug);

  // Hydrate the workspace list (config + user-created) once on mount.
  React.useEffect(() => {
    let active = true;
    services.workspaces
      .list()
      .then((ws) => {
        if (active) setWorkspaces(ws);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [services, setWorkspaces]);

  return (
    <AuthGate>
      <div className="flex min-h-screen w-full bg-canvas text-ink">
        {/* Skip link (WCAG 2.4.1): hidden until focused. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Saltar al contenido
        </a>
        <Sidebar onOpenSwitcher={() => setSwitcherOpen(true)} />
        <MobileNav onOpenSwitcher={() => setSwitcherOpen(true)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1400px] animate-fadein">
              {noAccess ? (
                <div className="grid min-h-[60vh] place-items-center">
                  <EmptyState
                    icon={Lock}
                    title="No tienes acceso a este workspace"
                    description={
                      memberships.length > 0
                        ? "Tu cuenta no es miembro de este workspace. Cambia a uno de los tuyos."
                        : "Tu cuenta no pertenece a ningún workspace todavía. Pide acceso a un administrador, o entra con la cuenta admin (NV_ADMIN_EMAIL)."
                    }
                    action={
                      memberships.length > 0 ? (
                        <Button size="sm" onClick={() => setSwitcherOpen(true)}>
                          Cambiar de workspace
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        </div>

        {/* Global overlays */}
        <WorkspaceSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
        <CommandPalette />
        <NotificationsPanel />
        <ComposeWizard />
        <EntityDrawer />
        <FeedbackDialog />
        <TourOverlay />
      </div>
    </AuthGate>
  );
}
