import * as React from "react";
import { useLocation } from "react-router-dom";

import { useServices } from "@/hooks/use-services";

const KEY = "nv-panel-visit";
/** After this long without activity a new visit starts. */
const IDLE_MS = 30 * 60_000;
const BEAT_MS = 60_000;

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** This tab's visit id: kept for the tab, renewed after 30 min idle. */
export function visitId(now = Date.now(), storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): string {
  let current: { id: string; at: number } | null = null;
  try {
    const raw = storage?.getItem(KEY);
    current = raw ? (JSON.parse(raw) as { id: string; at: number }) : null;
  } catch {
    current = null;
  }
  const id = current && now - current.at < IDLE_MS && /^[A-Za-z0-9_-]{8,40}$/.test(current.id) ? current.id : newId();
  try {
    storage?.setItem(KEY, JSON.stringify({ id, at: now }));
  } catch {
    /* private mode: the id lives only in memory for this call */
  }
  return id;
}

function safeStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Tells the server the panel is open (page change, then once a minute while
 * the tab is visible) for the super-admin «Usuarios y actividad». Best effort.
 */
export function useActivityPing(enabled = true) {
  const svc = useServices();
  const { pathname } = useLocation();
  const path = React.useRef(pathname);
  path.current = pathname;

  const send = React.useCallback(() => {
    if (!enabled) return;
    svc.admin.ping({ sessionId: visitId(), path: path.current }).catch(() => undefined);
  }, [enabled, svc]);

  React.useEffect(() => {
    send();
  }, [pathname, send]);

  React.useEffect(() => {
    if (!enabled) return;
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") send();
    }, BEAT_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [enabled, send]);
}
