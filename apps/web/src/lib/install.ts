/**
 * Installing NV Marketing as an app (PWA) on phones and computers. Pure
 * helpers: which device the person is on and the steps for it. The actual
 * «Instalar» prompt lives in hooks/use-install-prompt.ts.
 */

export type InstallPlatform = "android" | "ios" | "windows" | "mac" | "linux";

export const INSTALL_PLATFORMS: InstallPlatform[] = ["android", "ios", "windows", "mac", "linux"];

export interface InstallGuide {
  label: string;
  /** Where to open the panel to install it. */
  browser: string;
  steps: string[];
}

export const INSTALL_GUIDES: Record<InstallPlatform, InstallGuide> = {
  android: {
    label: "Android",
    browser: "Chrome",
    steps: [
      "Abre el panel en Chrome.",
      "Pulsa «Instalar ahora» aquí arriba. Si no aparece, toca el menú ⋮ de Chrome y elige «Instalar app» o «Añadir a pantalla de inicio».",
      "Confirma con «Instalar». El icono de NV Marketing queda en tu pantalla de inicio.",
    ],
  },
  ios: {
    label: "iPhone y iPad",
    browser: "Safari",
    steps: [
      "Abre el panel en Safari.",
      "Toca el botón Compartir (el cuadrado con la flecha hacia arriba).",
      "Baja y elige «Añadir a pantalla de inicio», luego toca «Añadir».",
      "Abre NV Marketing desde su icono: se ve a pantalla completa, como una app.",
    ],
  },
  windows: {
    label: "Windows",
    browser: "Chrome o Edge",
    steps: [
      "Abre el panel en Chrome o Edge.",
      "Pulsa «Instalar ahora» aquí arriba, o el icono de instalar (una pantalla con una flecha) al final de la barra de direcciones.",
      "Confirma con «Instalar». NV Marketing queda en el menú Inicio y puedes anclarlo a la barra de tareas.",
    ],
  },
  mac: {
    label: "Mac",
    browser: "Chrome, Edge o Safari",
    steps: [
      "En Chrome o Edge: pulsa «Instalar ahora» aquí arriba o el icono de instalar de la barra de direcciones.",
      "En Safari (macOS Sonoma o más nuevo): menú Archivo › «Añadir al Dock».",
      "NV Marketing queda en Aplicaciones y en el Dock, con su propia ventana.",
    ],
  },
  linux: {
    label: "Linux",
    browser: "Chrome, Chromium o Edge",
    steps: [
      "Abre el panel en Chrome, Chromium o Edge.",
      "Pulsa «Instalar ahora» aquí arriba o el icono de instalar de la barra de direcciones.",
      "NV Marketing queda en tu menú de aplicaciones.",
    ],
  },
};

/** The device from the browser's user agent (iPadOS reports itself as a Mac with touch). */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/macintosh|mac os x/.test(ua)) return maxTouchPoints > 1 ? "ios" : "mac";
  if (/windows/.test(ua)) return "windows";
  if (/cros|linux|x11/.test(ua)) return "linux";
  return "windows";
}

/** «?so=» from the website's download buttons, if it names a known device. */
export function parsePlatform(value: string | null | undefined): InstallPlatform | null {
  const v = (value ?? "").trim().toLowerCase();
  return (INSTALL_PLATFORMS as string[]).includes(v) ? (v as InstallPlatform) : null;
}

/** On iPhone the app can only be added from Safari (other browsers there lack the option on older iOS). */
export function iosOutsideSafari(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && /crios|fxios|edgios|opios|gsa\//.test(ua);
}
