import { SetMetadata } from "@nestjs/common";
import type { Role } from "@nv/domain";

export const ROLES_KEY = "roles";

/** Restricts a route to the given workspace roles (checked by RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
