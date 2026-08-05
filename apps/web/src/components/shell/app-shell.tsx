
import * as React from "react";

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { Topbar } from "./topbar";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { CommandPalette } from "./command-palette";
import { NotificationsPanel } from "./notifications-panel";
import { ComposeWizard } from "@/components/overlays/compose-wizard";
import { EntityDrawer } from "@/components/overlays/entity-drawer";
import { AuthGate } from "@/components/auth/auth-gate";
import { useServices } from "@/hooks/use-services";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const services = useServices();
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);

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
        <Sidebar onOpenSwitcher={() => setSwitcherOpen(true)} />
        <MobileNav onOpenSwitcher={() => setSwitcherOpen(true)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1400px] animate-fadein">{children}</div>
          </main>
        </div>

        {/* Global overlays */}
        <WorkspaceSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
        <CommandPalette />
        <NotificationsPanel />
        <ComposeWizard />
        <EntityDrawer />
      </div>
    </AuthGate>
  );
}
