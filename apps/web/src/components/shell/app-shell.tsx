"use client";

import * as React from "react";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { CommandPalette } from "./command-palette";
import { NotificationsPanel } from "./notifications-panel";
import { ComposeWizard } from "@/components/overlays/compose-wizard";
import { EntityDrawer } from "@/components/overlays/entity-drawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [switcherOpen, setSwitcherOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      <Sidebar onOpenSwitcher={() => setSwitcherOpen(true)} />

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
  );
}
