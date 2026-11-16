/**
 * Paths the panel (SPA) answers. The server sends index.html with 200 for
 * these and with 404 for anything else, so a mistyped link is a real 404 for
 * browsers, crawlers and uptime checks (the SPA still shows its own page).
 * Keep in sync with apps/web/src/app-routes.tsx.
 */
const PUBLIC = new Set([
  "/",
  "/login",
  "/demo",
  "/register",
  "/instalar",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/onboarding",
  "/admin",
  "/index.html",
]);

const WORKSPACE_PAGES = new Set([
  "dashboard",
  "tienda",
  "perfil",
  "calendario",
  "campanas",
  "contactos",
  "grupos",
  "segmentos",
  "formularios",
  "embudos",
  "secuencias",
  "afiliados",
  "inbox",
  "builder",
  "ai",
  "plantillas",
  "biblioteca",
  "cobros",
  "plan",
  "informes",
  "tareas",
  "automatizaciones",
  "analytics",
  "marketplace",
  "conexiones",
  "configuracion",
  "historial",
  "ayuda",
  "novedades",
  "estado",
]);

const SEGMENT = "[^/]+";

export function isSpaRoute(path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (PUBLIC.has(p)) return true;
  if (new RegExp(`^/(join|f|fn)/${SEGMENT}$`).test(p)) return true;
  const ws = new RegExp(`^/w/${SEGMENT}(?:/(${SEGMENT}))?$`).exec(p);
  return !!ws && (ws[1] === undefined || WORKSPACE_PAGES.has(ws[1]));
}
