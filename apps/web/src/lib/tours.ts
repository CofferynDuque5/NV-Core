/**
 * In-app guided tours (spotlight walkthroughs). Tour definitions live here (not
 * in @nv/domain) because they reference DOM selectors, which are a web concern.
 * Completion is remembered per browser in localStorage — a low-stakes UI
 * preference, so no backend round-trip is needed.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** CSS selector for the element to spotlight; omit for a centered step. */
  target?: string;
  title: string;
  body: string;
  /** Preferred tooltip placement relative to the target (default "bottom"). */
  placement?: TourPlacement;
}

export interface TourDef {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
}

/** Available tours. Selectors use `data-tour` hooks on real UI elements. */
export const TOURS: TourDef[] = [
  {
    id: "primeros-pasos",
    name: "Recorrido inicial",
    description: "Un paseo de un minuto por las áreas clave de NV Core.",
    steps: [
      {
        title: "Bienvenido a NV Core 👋",
        body: "Te mostramos en un minuto las áreas clave para empezar. Puedes salir cuando quieras.",
      },
      {
        target: '[data-tour="nav-dashboard"]',
        title: "Tu panel",
        body: "El Dashboard resume la actividad de tu workspace y tu progreso de configuración.",
        placement: "right",
      },
      {
        target: '[data-tour="nav-conexiones"]',
        title: "Conecta tus canales",
        body: "Vincula WhatsApp, Instagram o Facebook desde Conexiones para poder publicar.",
        placement: "right",
      },
      {
        target: '[data-tour="nav-contactos"]',
        title: "Tu audiencia",
        body: "Gestiona contactos y el pipeline de tu CRM. Puedes importarlos por CSV.",
        placement: "right",
      },
      {
        target: '[data-tour="nav-campanas"]',
        title: "Campañas",
        body: "Crea y lanza campañas omnicanal, con seguimiento de progreso en tiempo real.",
        placement: "right",
      },
      {
        target: '[data-tour="topbar-create"]',
        title: "Crea al instante",
        body: "El botón «Crear» abre el asistente para publicar contenido rápidamente.",
        placement: "bottom",
      },
      {
        target: '[data-tour="nav-ayuda"]',
        title: "¿Necesitas ayuda?",
        body: "Encuentra guías en el Centro de ayuda y vuelve a lanzar este recorrido cuando quieras.",
        placement: "right",
      },
      {
        title: "¡Listo! 🎉",
        body: "Ya conoces lo esencial. Completa la guía de primeros pasos del Dashboard para tu primer post.",
      },
    ],
  },
];

export function getTour(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

// ── Completion state (per browser) ───────────────────────────────────────────

const STORAGE_KEY = "nv.tours.completed";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // localStorage can throw (privacy mode) — degrade gracefully.
  }
}

/** The set of completed tour ids. */
export function completedTours(storage: StorageLike | null = defaultStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isTourCompleted(id: string, storage: StorageLike | null = defaultStorage()): boolean {
  return completedTours(storage).includes(id);
}

/** Mark a tour completed; returns the updated list. Idempotent. */
export function markTourCompleted(
  id: string,
  storage: StorageLike | null = defaultStorage(),
): string[] {
  const current = completedTours(storage);
  if (current.includes(id)) return current;
  const next = [...current, id];
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore write failures (quota / privacy mode) */
  }
  return next;
}

// ── Tooltip positioning (pure) ───────────────────────────────────────────────

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
}
export interface Positioned {
  top: number;
  left: number;
  placement: TourPlacement;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Position a tooltip of `tip` size next to `target` at the desired placement,
 * flipping to the opposite side when it would overflow and clamping so it always
 * stays within the viewport (with an 8px margin).
 */
export function positionTooltip(
  target: Box,
  desired: TourPlacement,
  tip: Size,
  vp: Viewport,
  gap = 12,
  margin = 8,
): Positioned {
  const fitsVertically = (p: "top" | "bottom") =>
    p === "top" ? target.top - gap - tip.height >= margin : target.top + target.height + gap + tip.height <= vp.height - margin;
  const fitsHorizontally = (p: "left" | "right") =>
    p === "left" ? target.left - gap - tip.width >= margin : target.left + target.width + gap + tip.width <= vp.width - margin;

  let placement = desired;
  if (desired === "bottom" && !fitsVertically("bottom") && fitsVertically("top")) placement = "top";
  else if (desired === "top" && !fitsVertically("top") && fitsVertically("bottom")) placement = "bottom";
  else if (desired === "right" && !fitsHorizontally("right") && fitsHorizontally("left")) placement = "left";
  else if (desired === "left" && !fitsHorizontally("left") && fitsHorizontally("right")) placement = "right";

  let top: number;
  let left: number;
  switch (placement) {
    case "top":
      top = target.top - gap - tip.height;
      left = target.left + target.width / 2 - tip.width / 2;
      break;
    case "bottom":
      top = target.top + target.height + gap;
      left = target.left + target.width / 2 - tip.width / 2;
      break;
    case "left":
      left = target.left - gap - tip.width;
      top = target.top + target.height / 2 - tip.height / 2;
      break;
    default: // right
      left = target.left + target.width + gap;
      top = target.top + target.height / 2 - tip.height / 2;
      break;
  }

  return {
    top: clamp(top, margin, Math.max(margin, vp.height - tip.height - margin)),
    left: clamp(left, margin, Math.max(margin, vp.width - tip.width - margin)),
    placement,
  };
}
