
import { Bell } from "lucide-react";

import { useUiStore } from "@/stores/ui-store";
import { useNotifications } from "@/hooks/use-domain-data";
import { useMarkNotificationsRead } from "@/hooks/use-domain-mutations";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function NotificationsPanel() {
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();

  const items = query.data ?? [];
  const hasUnread = items.some((n) => !n.read);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="sm:max-w-sm">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Notificaciones</SheetTitle>
            <button
              type="button"
              onClick={() => markRead.mutate()}
              disabled={!hasUnread || markRead.isPending}
              className="text-xs text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Marcar leídas
            </button>
          </div>
        </SheetHeader>
        <SheetBody>
          {query.isLoading ? (
            <ListSkeleton rows={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Sin notificaciones"
              description="Cuando ocurra algo importante en tu workspace aparecerá aquí."
              compact
            />
          ) : (
            <ul className="space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`nv-panel flex items-start gap-2.5 p-3 ${n.read ? "opacity-60" : ""}`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{n.title}</div>
                    {n.meta ? <div className="text-xs text-ink-muted">{n.meta}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
