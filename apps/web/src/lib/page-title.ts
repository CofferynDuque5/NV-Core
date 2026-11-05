import { MODULE_META, type ModuleId } from "@nv/domain";

const BRAND = "NV Marketing";

/** Pages outside a brand. */
const PUBLIC: Record<string, string> = {
  "/login": "Ingresar",
  "/register": "Crear cuenta",
  "/demo": "Demo",
  "/instalar": "Instalar la app",
  "/forgot-password": "Recuperar contraseña",
  "/reset-password": "Nueva contraseña",
  "/verify-email": "Verificar email",
  "/onboarding": "Crea tu marca",
  "/admin": "Administración",
};

/** Brand pages that aren't menu modules. */
const EXTRA: Record<string, string> = {
  tienda: "Tienda",
  perfil: "Mi perfil",
  cobros: "Cobros",
  plan: "Mi plan",
  informes: "Informe semanal",
  tareas: "Tareas",
  historial: "Historial",
  ayuda: "Ayuda",
  novedades: "Novedades",
  estado: "Estado del sistema",
};

/**
 * The browser tab title for a path: «Contactos · NV Marketing». Unknown
 * paths read «Página no encontrada»; «/» is just the brand.
 */
export function pageTitle(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return `${BRAND} — Panel de ventas`;
  const pub = PUBLIC[path];
  if (pub) return `${pub} · ${BRAND}`;
  if (path.startsWith("/join/")) return `Unirte a una marca · ${BRAND}`;
  if (path.startsWith("/f/") || path.startsWith("/fn/")) return BRAND;
  const m = /^\/w\/[^/]+(?:\/([^/]+))?$/.exec(path);
  if (m) {
    const page = m[1] ?? "dashboard";
    const label = EXTRA[page] ?? MODULE_META[page as ModuleId]?.label;
    if (label) return `${label} · ${BRAND}`;
  }
  return `Página no encontrada · ${BRAND}`;
}
