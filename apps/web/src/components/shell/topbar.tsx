
import { Bell, Menu, Plus, Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useCommandStore } from "@/stores/command-store";
import { useUiStore } from "@/stores/ui-store";
import { useNotifications, useChangelog } from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  const openCommand = useCommandStore((s) => s.setOpen);
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
    <header className="sticky top-0 z-20 flex h-[57px] items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur">
      {/* Mobile hamburger */}
      <button
        onClick={() => openMobileNav(true)}
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-panel text-ink-muted transition-colors hover:text-ink lg:hidden"
        title="Menú"
        aria-label="Abrir menú"
      >
        <Menu className="size-[18px]" />
      </button>

      {/* Command trigger */}
      <button
        onClick={() => openCommand(true)}
        className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-line-soft bg-panel px-3 text-left text-sm text-ink-faint transition-colors hover:border-line-bright"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Buscar o ejecutar…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-line-strong bg-panel-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-muted sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" className="gap-1.5" onClick={openCompose} data-tour="topbar-create">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Crear</span>
        </Button>

        <ThemeToggle />

        <button
          onClick={() => navigate(`/w/${ws.slug}/novedades`)}
          className="relative grid size-9 place-items-center rounded-lg border border-line-soft bg-panel text-ink-muted transition-colors hover:border-line-bright hover:text-ink"
          title="Novedades"
          aria-label={unseen > 0 ? `Novedades, ${unseen} sin leer` : "Novedades"}
        >
          <Sparkles className="size-[18px]" />
          {unseen > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {unseen}
            </span>
          ) : null}
        </button>

        <button
          onClick={toggleNotifications}
          className="relative grid size-9 place-items-center rounded-lg border border-line-soft bg-panel text-ink-muted transition-colors hover:border-line-bright hover:text-ink"
          title="Notificaciones"
          aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        >
          <Bell className="size-[18px]" />
          {unread > 0 ? (
            <span
              className={cn(
                "absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-state-danger px-1 text-[10px] font-bold text-white",
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
