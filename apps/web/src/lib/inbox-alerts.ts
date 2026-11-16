/**
 * New-message alerts in the panel: a short chime (made with Web Audio, no
 * file to download), the unread count in the tab title, and browser push so
 * notices arrive with the panel closed.
 */

const SOUND_KEY = "nv-inbox-sound";

/** Sound on new messages (on unless the member turned it off in this browser). */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* private mode: stays on for this visit */
  }
}

let ctx: AudioContext | null = null;

/** Browsers only allow sound after the person touched the page once: unlock on the first tap/key. */
export function unlockSound(): void {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

/** Two soft notes, like a chat app. Silent if the browser hasn't allowed sound yet. */
export function playChime(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const t0 = ctx.currentTime + 0.01;
  const notes: [number, number][] = [
    [880, 0],
    [1318.5, 0.12],
  ];
  for (const [freq, at] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.4);
  }
  return true;
}

/** "(3) Inbox · NV Marketing" while there are unread chats. */
export function titleWithCount(title: string, unread: number): string {
  const clean = title.replace(/^\(\d+\+?\)\s*/, "");
  if (unread <= 0) return clean;
  return `(${unread > 99 ? "99+" : unread}) ${clean}`;
}

// ── Push (panel closed) ─────────────────────────────────────────────────────

export type PushState = "unsupported" | "ios-needs-install" | "denied" | "off" | "on";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** base64url → bytes, for the server key. */
export function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask permission and subscribe this browser; returns what to send to the server. */
export async function subscribePush(publicKey: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No diste permiso para mostrar avisos en este navegador.");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey) as unknown as BufferSource,
    });
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Este navegador no entregó los datos del aviso.");
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

export async function unsubscribePush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  return endpoint;
}
