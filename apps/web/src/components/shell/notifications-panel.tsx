"use client";

import { Bell } from "lucide-react";

import { useUiStore } from "@/stores/ui-store";
import { useNotifications } from "@/hooks/use-domain-data";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function NotificationsPanel() {
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const query = useNotifications();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="sm:max-w-sm">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Notificaciones</SheetTitle>
            <button className="text-xs text-ink-muted hover:text-ink">Marcar leídas</button>
          </div>
        </SheetHeader>
        <SheetBody>
          {query.isLoading ? (
            <ListSkeleton rows={4} />
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Sin notificaciones"
              description="Cuando ocurra algo importante en tu workspace aparecerá aquí."
              compact
            />
          ) : (
            <ul className="space-y-2">
              {(query.data ?? []).map((n) => (
                <li key={n.id} className="nv-panel p-3">
                  <div className="text-sm font-medium text-ink">{n.title}</div>
                  {n.meta ? <div className="text-xs text-ink-muted">{n.meta}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
