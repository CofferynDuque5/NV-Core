import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronsUpDown, Lock } from "lucide-react";
import { initialsOf } from "@nv/domain";

import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspace } from "@/hooks/use-workspace";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getNavIcon } from "./sidebar-icon";
import { navSectionsFor } from "@/lib/goal-nav";
import { usePlanLocks } from "@/hooks/use-plan-locks";

export function Sidebar({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
  const collapsed = useUiStore((s) => s.navCollapsed);
  const toggleNav = useUiStore((s) => s.toggleNav);
  const user = useAuthStore((s) => s.user);
  const ws = useWorkspace();
  const locks = usePlanLocks(ws.slug) as string[];
  const { pathname } = useLocation();

  const userInitials = user ? initialsOf(user.name) : "NV";

  return (
    <aside
      className={cn(
        "border-line bg-nav sticky top-0 z-30 hidden h-screen flex-col border-r transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-[248px]",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "border-line flex h-[57px] shrink-0 items-center gap-2.5 border-b px-3.5",
          collapsed && "justify-center",
        )}
      >
        <button
          onClick={toggleNav}
          title="Expandir / colapsar"
          className="from-brand to-brand-violet shadow-brand grid size-8 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br"
        >
          <BrandMark size={19} />
        </button>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1 leading-none">
              <div className="font-display nv-gradient-text text-lg font-semibold tracking-tight">
                NV Marketing
              </div>
              <div className="text-ink-faint mt-0.5 text-[8.5px] font-semibold tracking-[0.22em]">
                PANEL DE VENTAS
              </div>
            </div>
            <button
              onClick={toggleNav}
              title="Colapsar"
              className="border-line-strong bg-panel-raised hover:bg-secondary grid size-6 shrink-0 place-items-center rounded-md border"
            >
              <ChevronLeft className="text-ink-muted size-3.5" />
            </button>
          </>
        ) : null}
      </div>

      {/* Workspace switcher */}
      <div className="px-2.5 pt-2.5">
        <button
          onClick={onOpenSwitcher}
          title="Cambiar de workspace"
          className={cn(
            "border-line-soft bg-panel hover:border-line-bright flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          <span
            className="grid size-6 shrink-0 place-items-center rounded-[7px] text-[10px] font-extrabold text-white"
            style={{ background: ws.accent }}
          >
            {ws.initials}
          </span>
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="text-ink block truncate text-xs font-bold">{ws.name}</span>
                <span className="text-ink-faint block truncate text-[10px]">{ws.tagline}</span>
              </span>
              <ChevronsUpDown className="text-ink-faint size-3.5 shrink-0" />
            </>
          ) : null}
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-2 flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {navSectionsFor(ws.goals).map((section) => (
          <div key={section.label}>
            {!collapsed ? (
              <div className="text-ink-faint px-2 pb-1.5 pt-1 text-[10px] font-semibold tracking-[0.16em]">
                {section.label}
              </div>
            ) : (
              <div className="bg-line mx-2 mb-1.5 mt-1 h-px" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const href = `/w/${ws.slug}/${item.module}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                const Icon = getNavIcon(item.icon);
                const link = (
                  <Link
                    to={href}
                    data-tour={`nav-${item.module}`}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-[10px] px-2 py-2 text-[13px] font-medium transition-all",
                      collapsed && "justify-center px-0",
                      active
                        ? "from-brand/18 to-brand-violet/10 text-ink-bright ring-brand/25 bg-gradient-to-r shadow-[0_6px_18px_-12px_rgba(124,124,240,0.8)] ring-1 ring-inset"
                        : "text-ink-soft hover:bg-panel-raised hover:text-ink",
                    )}
                  >
                    {active && !collapsed ? (
                      <span className="nv-brand-gradient absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full" />
                    ) : null}
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0 transition-colors",
                        active ? "text-brand-bright" : "text-ink-muted group-hover:text-ink-soft",
                      )}
                    />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {!collapsed && locks.includes(item.module) ? (
                      <Lock
                        className="text-ink-faint ml-auto size-3.5 shrink-0"
                        aria-label="Solo en el plan Pro"
                        data-testid={`nav-lock-${item.module}`}
                      />
                    ) : null}
                  </Link>
                );
                return (
                  <li key={item.module}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer / user */}
      <div className="border-line border-t p-2.5">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] px-2 py-1.5",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="from-brand to-brand-violet grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white">
            {userInitials}
          </span>
          {!collapsed ? (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-ink truncate text-xs font-semibold">
                {user ? user.name : "Tu cuenta"}
              </div>
              <div className="text-ink-faint truncate text-[10px]">
                {user ? user.email : "Sin sesión iniciada"}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
