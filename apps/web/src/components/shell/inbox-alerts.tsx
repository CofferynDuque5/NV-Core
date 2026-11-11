import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { useServices } from "@/hooks/use-services";
import { isBackendConfigured } from "@/lib/env";
import { playChime, soundEnabled, titleWithCount, unlockSound } from "@/lib/inbox-alerts";

/**
 * Rings when a chat message arrives, wherever the member is in the panel (or
 * in another tab): chime, the unread count in the tab title, a pop-up with
 * «Abrir» and, with the tab hidden, a system notice when push isn't on (push
 * covers the panel closed). Polls a light endpoint every 10 s.
 */
export function InboxAlerts() {
  const { workspace } = useParams<{ workspace?: string }>();
  const svc = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const pulse = useQuery({
    queryKey: [workspace, "inbox", "pulse"],
    queryFn: () => svc.inbox.pulse(workspace as string),
    enabled: Boolean(workspace) && isBackendConfigured(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const lastSeen = React.useRef<{ ws?: string; id?: string | null }>({});
  const queryClient = useQueryClient();
  const lastPulse = React.useRef<string | null>(null);
  const onInbox = location.pathname.endsWith("/inbox");
  const onInboxRef = React.useRef(onInbox);
  onInboxRef.current = onInbox;

  // Sound needs one touch of the page first (browser rule).
  React.useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: false, passive: true });
    window.addEventListener("keydown", unlock, { once: false });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  React.useEffect(() => {
    const data = pulse.data;
    if (!data || !workspace) return;
    document.title = titleWithCount(document.title, data.unread);
    // Something changed (a new message, a chat read or marked unread): refresh
    // the Inbox list and the open chat now instead of waiting for their poll.
    const mark = `${workspace}|${data.unread}|${data.latest?.id ?? ""}`;
    if (lastPulse.current !== null && lastPulse.current !== mark) {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === workspace && q.queryKey[1] === "inbox" && q.queryKey[2] !== "pulse",
      });
    }
    lastPulse.current = mark;
    const latest = data.latest;
    const seen = lastSeen.current;
    // First reading (or another brand): just remember where we are.
    if (seen.ws !== workspace) {
      lastSeen.current = { ws: workspace, id: latest?.id ?? null };
      return;
    }
    if (!latest || latest.id === seen.id) return;
    lastSeen.current = { ws: workspace, id: latest.id };
    // Only messages from the last few minutes ring (not a chat restored from history).
    if (Date.now() - new Date(latest.at).getTime() > 5 * 60_000) return;

    if (soundEnabled()) playChime();
    const open = () => navigate(`/w/${workspace}/inbox?c=${encodeURIComponent(latest.conversationId)}`);
    if (document.visibilityState === "visible") {
      if (!onInboxRef.current) {
        toast(`Mensaje de ${latest.contactName}`, {
          description: latest.text,
          action: { label: "Abrir", onClick: open },
          duration: 8_000,
        });
      }
      return;
    }
    void showSystemNotice(latest.contactName, latest.text, open);
  }, [pulse.data, workspace, navigate, queryClient]);

  // Keep the count in the title when the page changes its own title.
  React.useEffect(() => {
    const unread = pulse.data?.unread ?? 0;
    const id = window.setInterval(() => {
      const next = titleWithCount(document.title, unread);
      if (next !== document.title) document.title = next;
    }, 1_000);
    return () => window.clearInterval(id);
  }, [pulse.data?.unread]);

  return null;
}

/** System notice from the page, only when push isn't already doing it in this browser. */
async function showSystemNotice(title: string, body: string, onClick: () => void): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (await reg?.pushManager?.getSubscription()) return; // push shows it (also with the panel closed)
    const n = new Notification(title, { body, icon: "/icon-192.png", tag: `chat-${title}` });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* some browsers only allow notices from the service worker */
  }
}
