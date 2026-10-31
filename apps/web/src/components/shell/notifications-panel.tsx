
import { AlertTriangle, Bell, CheckCircle2, Info, XCircle } from "lucide-react";
import { simplifyNotice, type Notification } from "@nv/domain";

import { useUiStore } from "@/stores/ui-store";
import { useNotifications } from "@/hooks/use-domain-data";
import { useMarkNotificationsRead } from "@/hooks/use-domain-mutations";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const TYPE_ICON: Record<Notification["type"], { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "text-brand" },
  success: { icon: CheckCircle2, cls: "text-state-success" },
  warning: { icon: AlertTriangle, cls: "text-state-warning" },
  error: { icon: XCircle, cls: "text-state-danger" },
};

/** "hace 5 min", "hace 3 h", "12 oct". */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  if (h < 48) return "ayer";
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function NotificationsPanel() {
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();

  const items = query.data ?? [];
  const unread = items.filter((n) => !n.read).length;
  const hasUnread = unread > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="sm:max-w-sm">
        <SheetHeader>
          {/* Room on the right for the sheet's close button. */}
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>
              Notificaciones
              {hasUnread ? <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">{unread}</span> : null}
            </SheetTitle>
            {hasUnread ? (
              <button
                type="button"
                onClick={() => markRead.mutate()}
                disabled={markRead.isPending}
                className="text-xs text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Marcar leídas
              </button>
            ) : null}
          </div>
        </SheetHeader>
        <SheetBody>
          {query.isLoading ? (
            <ListSkeleton rows={4} />
          ) : query.isError ? (
            <EmptyState
              icon={Bell}
              title="No se pudieron cargar"
              description="Revisa tu conexión y vuelve a abrir el panel."
              compact
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Sin notificaciones"
              description="Cuando ocurra algo importante en tu workspace aparecerá aquí."
              compact
            />
          ) : (
            <ul className="space-y-2">
              {items.map((n) => {
                const { icon: Icon, cls } = TYPE_ICON[n.type] ?? TYPE_ICON.info;
                return (
                  <li
                    key={n.id}
                    className={`nv-panel flex items-start gap-2.5 p-3 ${n.read ? "opacity-60" : "border-brand/30"}`}
                  >
                    <Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-medium text-ink">
                        {n.title}
                        {n.personal ? <span className="ml-1.5 text-[10px] uppercase text-brand">para ti</span> : null}
                      </div>
                      {n.meta ? <div className="break-words text-xs text-ink-muted">{simplifyNotice(n.meta)}</div> : null}
                      <div className="mt-1 text-[11px] text-ink-faint">{ago(n.createdAt)}</div>
                    </div>
                    {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Sin leer" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
