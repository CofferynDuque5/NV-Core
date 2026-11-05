import { Bell, Menu, Plus, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useNotifications, useChangelog } from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";

export function Topbar() {
  const toggleNotifications = useUiStore((s) => s.toggleNotifications);
  const openCompose = useUiStore((s) => s.openCompose);
  const openMobileNav = useUiStore((s) => s.setMobileNavOpen);
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  const navigate = useNavigate();
  const ws = useWorkspace();
  const changelog = useChangelog();
  const unseen = changelog.data?.unseenCount ?? 0;

  return (
    <header className="border-line bg-canvas/80 sticky top-0 z-20 flex h-[57px] items-center gap-3 border-b px-4 backdrop-blur">
      {/* Mobile hamburger */}
      <button
        onClick={() => openMobileNav(true)}
        className="border-line-soft bg-panel text-ink-muted hover:text-ink grid size-9 shrink-0 place-items-center rounded-lg border transition-colors lg:hidden"
        title="Menú"
        aria-label="Abrir menú"
      >
        <Menu className="size-[18px]" />
      </button>

      {/* Search: stays in the bar, results open below it (Ctrl+K). */}
      <CommandPalette />

      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" className="gap-1.5" onClick={openCompose} data-tour="topbar-create">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Crear</span>
        </Button>

        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        <button
          onClick={() => navigate(`/w/${ws.slug}/novedades`)}
          className="border-line-soft bg-panel text-ink-muted hover:border-line-bright hover:text-ink relative hidden size-9 place-items-center rounded-lg border transition-colors sm:grid"
          title="Novedades"
          aria-label={unseen > 0 ? `Novedades, ${unseen} sin leer` : "Novedades"}
        >
          <Sparkles className="size-[18px]" />
          {unseen > 0 ? (
            <span className="bg-brand absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white">
              {unseen}
            </span>
          ) : null}
        </button>

        <button
          onClick={toggleNotifications}
          className="border-line-soft bg-panel text-ink-muted hover:border-line-bright hover:text-ink relative grid size-9 place-items-center rounded-lg border transition-colors"
          title="Notificaciones"
          aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        >
          <Bell className="size-[18px]" />
          {unread > 0 ? (
            <span
              className={cn(
                "bg-state-danger absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white",
              )}
            >
              {unread}
            </span>
          ) : null}
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
