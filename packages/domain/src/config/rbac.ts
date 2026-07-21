import { ROLES, type Role } from "../enums";

/**
 * RBAC policy — STRUCTURAL configuration (what each role is allowed to do),
 * not user data. The list of who holds each role loads empty until a backend
 * exists.
 */
export const ROLE_ORDER: Role[] = [...ROLES];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Owner: "Control total, facturación y equipo",
  Admin: "Gestiona campañas, conexiones y flujos",
  Editor: "Crea y programa contenido",
  Visor: "Solo lectura de analytics",
};

export interface PermissionPolicy {
  permission: string;
  /** Allowed per role, aligned with ROLE_ORDER. */
  allowed: Record<Role, boolean>;
}

export const PERMISSION_MATRIX: PermissionPolicy[] = [
  { permission: "Crear campañas", allowed: { Owner: true, Admin: true, Editor: true, Visor: false } },
  { permission: "Editar campañas", allowed: { Owner: true, Admin: true, Editor: true, Visor: false } },
  { permission: "Eliminar campañas", allowed: { Owner: true, Admin: true, Editor: false, Visor: false } },
  { permission: "Publicar contenido", allowed: { Owner: true, Admin: true, Editor: true, Visor: false } },
  { permission: "Conectar redes", allowed: { Owner: true, Admin: true, Editor: false, Visor: false } },
  { permission: "Crear automatizaciones", allowed: { Owner: true, Admin: true, Editor: false, Visor: false } },
  { permission: "Ver Analytics", allowed: { Owner: true, Admin: true, Editor: true, Visor: true } },
  { permission: "Gestionar usuarios", allowed: { Owner: true, Admin: false, Editor: false, Visor: false } },
];
