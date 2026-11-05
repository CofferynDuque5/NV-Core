import { Link, useLocation } from "react-router-dom";
import { ChevronsUpDown, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useWorkspace } from "@/hooks/use-workspace";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getNavIcon } from "./sidebar-icon";
import { navSectionsFor } from "@/lib/goal-nav";
import { usePlanLocks } from "@/hooks/use-plan-locks";
import { BrandTile } from "./brand-mark";

export function MobileNav({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const ws = useWorkspace();
  const locks = usePlanLocks(ws.slug) as string[];
  const { pathname } = useLocation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-72 bg-nav p-0 sm:max-w-72">
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <BrandTile size={32} />
            <SheetTitle className="font-display">NV Marketing</SheetTitle>
          </div>
        </SheetHeader>

        <div className="px-3 pt-3">
          <button
            onClick={() => {
              setOpen(false);
              onOpenSwitcher();
            }}
            className="flex w-full items-center gap-2.5 rounded-[10px] border border-line-soft bg-panel px-2.5 py-2 text-left"
          >
            <span
              className="grid size-6 shrink-0 place-items-center rounded-[7px] text-[10px] font-extrabold text-white"
              style={{ background: ws.accent }}
            >
              {ws.initials}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">{ws.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" />
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-4 overflow-y-auto px-3 pb-6">
          {navSectionsFor(ws.goals).map((section) => (
            <div key={section.label}>
              <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold tracking-[0.16em] text-ink-faint">
                {section.label}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const href = `/w/${ws.slug}/${item.module}`;
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  const Icon = getNavIcon(item.icon);
                  return (
                    <li key={item.module}>
                      <Link
                        to={href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-brand/12 text-ink-bright"
                            : "text-ink-soft hover:bg-panel-raised hover:text-ink",
                        )}
                      >
                        <Icon className={cn("size-[18px]", active ? "text-brand" : "text-ink-muted")} />
                        {item.label}
                        {locks.includes(item.module) ? <Lock className="ml-auto size-3.5 text-ink-faint" aria-label="Solo en el plan Pro" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
