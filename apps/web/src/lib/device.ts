/**
 * One free trial per device: a random id the browser keeps (localStorage and
 * a long-lived cookie, so clearing one still leaves the other) and a hash of
 * the browser's traits (screen, time zone, language, GPU, canvas drawing).
 * Both go to the API as headers; the server only stores them hashed again.
 * Nothing here identifies the person: it only tells "this browser again".
 */

const KEY = "nv-device";
const ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)nv-device=([A-Za-z0-9_-]{16,128})/);
  return m ? m[1]! : null;
}

function newId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The browser's device id (created once, then reused). */
export function deviceId(): string | null {
  if (typeof window === "undefined") return null;
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (!id || !ID_RE.test(id)) id = readCookie();
  if (!id || !ID_RE.test(id)) id = newId();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked */
  }
  try {
    document.cookie = `${KEY}=${id}; max-age=${400 * 86_400}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    /* cookies blocked */
  }
  return id;
}

function canvasTrait(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 220;
    c.height = 40;
    const g = c.getContext("2d");
    if (!g) return "";
    g.textBaseline = "top";
    g.font = "16px Arial";
    g.fillStyle = "#f60";
    g.fillRect(100, 1, 62, 20);
    g.fillStyle = "#069";
    g.fillText("NV Marketing 🔊 ñ", 2, 15);
    return c.toDataURL();
  } catch {
    return "";
  }
}

function gpuTrait(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)}|${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}`
      : "";
  } catch {
    return "";
  }
}

let fingerprintValue: string | null = null;
let pending: Promise<string | null> | null = null;

/** SHA-256 (base64url) of the browser's traits; computed once. */
export function fingerprint(): Promise<string | null> {
  if (fingerprintValue) return Promise.resolve(fingerprintValue);
  if (typeof window === "undefined" || !crypto?.subtle) return Promise.resolve(null);
  pending ??= (async () => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const traits = [
      nav.userAgent,
      nav.language,
      (nav.languages ?? []).join(","),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio}`,
      nav.hardwareConcurrency,
      nav.deviceMemory ?? "",
      nav.maxTouchPoints,
      gpuTrait(),
      canvasTrait(),
    ].join("¦");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(traits));
    fingerprintValue = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return fingerprintValue;
  })().catch(() => null);
  return pending;
}

/** Headers that tell the API which device asks (empty when unavailable). */
export async function deviceHeaders(): Promise<Record<string, string>> {
  const id = deviceId();
  const fp = await fingerprint();
  return { ...(id ? { "X-NV-Device": id } : {}), ...(fp ? { "X-NV-Fp": fp } : {}) };
}
