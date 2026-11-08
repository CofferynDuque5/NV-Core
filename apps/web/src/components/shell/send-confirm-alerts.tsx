import * as React from "react";
import { toast } from "sonner";

import { useNotifications } from "@/hooks/use-domain-data";
import { useDecideSend } from "@/hooks/use-domain-mutations";

const SEEN_KEY = "nv-send-confirm-seen";

function readSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-50)));
  } catch {
    /* private mode: the toast may show again after a reload, that's fine */
  }
}

/**
 * Pops up the notice before a scheduled campaign send («Confirmar envío» /
 * «No enviar») as soon as it arrives, and as a system notification when the
 * browser allows it. The same notice stays in the bell panel.
 */
export function SendConfirmAlerts() {
  const notifications = useNotifications();
  const decide = useDecideSend();
  const decideRef = React.useRef(decide.mutate);
  decideRef.current = decide.mutate;

  React.useEffect(() => {
    const pending = (notifications.data ?? []).filter(
      (n) => n.actions?.type === "campaign-confirm" && n.actions.state === "pending",
    );
    if (pending.length === 0) return;
    const seen = readSeen();
    for (const n of pending) {
      const a = n.actions!;
      const key = `${a.campaignId}|${a.slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      toast.warning(n.title, {
        id: key,
        // Just «Va a N grupos (…)»: the whole notice stays in the bell panel.
        description: n.meta ? `${n.meta.split(". ")[0]}.` : undefined,
        duration: 5 * 60_000,
        action: {
          label: "Confirmar envío",
          onClick: () => decideRef.current({ campaignId: a.campaignId, slot: a.slot, decision: "confirm" }),
        },
        cancel: {
          label: "No enviar",
          onClick: () => decideRef.current({ campaignId: a.campaignId, slot: a.slot, decision: "skip" }),
        },
      });
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          new Notification(n.title, { body: "Abre el panel para confirmar o no enviar.", tag: key });
        }
      } catch {
        /* some phones only allow notifications from a service worker */
      }
    }
    writeSeen(seen);
  }, [notifications.data]);

  return null;
}
