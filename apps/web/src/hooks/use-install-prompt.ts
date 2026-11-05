import * as React from "react";

/** Chrome/Edge's install event (not in the TS DOM lib yet). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __nvInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

const EVENT = "nv-install-prompt";

/**
 * Keep the browser's install offer as soon as it arrives (it fires once,
 * early, often before the page that shows the button is mounted). Called
 * once from main.tsx.
 */
export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__nvInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(EVENT));
  });
  window.addEventListener("appinstalled", () => {
    window.__nvInstallPrompt = null;
    window.dispatchEvent(new Event(EVENT));
  });
}

/** Whether the panel is already running as the installed app. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** The pending install offer (null when the browser has none) and a way to show it. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = React.useState<BeforeInstallPromptEvent | null>(
    () => (typeof window !== "undefined" ? window.__nvInstallPrompt ?? null : null),
  );
  const [installed, setInstalled] = React.useState(isInstalledApp);

  React.useEffect(() => {
    const sync = () => {
      setPrompt(window.__nvInstallPrompt ?? null);
      setInstalled(isInstalledApp() || window.__nvInstallPrompt === null);
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const install = React.useCallback(async (): Promise<boolean> => {
    const p = window.__nvInstallPrompt;
    if (!p) return false;
    await p.prompt();
    const { outcome } = await p.userChoice;
    window.__nvInstallPrompt = undefined;
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome === "accepted";
  }, []);

  return { canPrompt: !!prompt, installed, install };
}
