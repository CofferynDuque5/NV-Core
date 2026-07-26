"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@nv/domain";
import { ChevronLeft, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNavIcon } from "./sidebar-icon";

export function Sidebar({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
  const collapsed = useUiStore((s) => s.navCollapsed);
  const toggleNav = useUiStore((s) => s.toggleNav);
  const user = useAuthStore((s) => s.user);
  const ws = useWorkspace();
  const pathname = usePathname();

  const userInitials = user
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "NV";

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen flex-col border-r border-line bg-nav transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-[248px]",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-[57px] shrink-0 items-center gap-2.5 border-b border-line px-3.5",
          collapsed && "justify-center",
        )}
      >
        <button
          onClick={toggleNav}
          title="Expandir / colapsar"
          className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-brand to-brand-violet shadow-brand"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h6l2-3 3 6 2-3h3" />
          </svg>
        </button>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1 leading-none">
              <div className="font-display text-lg font-semibold tracking-tight text-ink-bright">
                NV Core
              </div>
              <div className="mt-0.5 text-[8.5px] font-semibold tracking-[0.22em] text-ink-faint">
                BUSINESS OS
              </div>
            </div>
            <button
              onClick={toggleNav}
              title="Colapsar"
              className="grid size-6 shrink-0 place-items-center rounded-md border border-line-strong bg-panel-raised hover:bg-secondary"
            >
              <ChevronLeft className="size-3.5 text-ink-muted" />
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
            "flex w-full items-center gap-2.5 rounded-[10px] border border-line-soft bg-panel px-2.5 py-2 text-left transition-colors hover:border-line-bright",
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
                <span className="block truncate text-xs font-bold text-ink">{ws.name}</span>
                <span className="block truncate text-[10px] text-ink-faint">{ws.tagline}</span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" />
            </>
          ) : null}
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-2 flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed ? (
              <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold tracking-[0.16em] text-ink-faint">
                {section.label}
              </div>
            ) : (
              <div className="mx-2 mb-1.5 mt-1 h-px bg-line" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const href = `/w/${ws.slug}/${item.module}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                const Icon = getNavIcon(item.icon);
                const link = (
                  <Link
                    href={href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-brand/12 text-ink-bright"
                        : "text-ink-soft hover:bg-panel-raised hover:text-ink",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0",
                        active ? "text-brand" : "text-ink-muted group-hover:text-ink-soft",
                      )}
                    />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {active && !collapsed ? (
                      <span className="ml-auto h-4 w-1 rounded-full bg-brand" />
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
      <div className="border-t border-line p-2.5">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] px-2 py-1.5",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-violet text-[11px] font-bold text-white">
            {userInitials}
          </span>
          {!collapsed ? (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-semibold text-ink">
                {user ? user.name : "Tu cuenta"}
              </div>
              <div className="truncate text-[10px] text-ink-faint">
                {user ? user.email : "Sin sesión iniciada"}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
