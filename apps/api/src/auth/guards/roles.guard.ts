import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@nv/domain";

import { AuthStore } from "../auth.store";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedUser } from "../auth.types";

/**
 * Restricts a workspace-scoped route to specific roles. Reads the caller's role
 * for the route's `:workspace` from the membership store. Requires the route to
 * also run under authentication + membership checks.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: AuthStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser; params: { workspace?: string } }>();
    const user = request.user;
    const slug = request.params.workspace;
    if (!user || !slug) throw new ForbiddenException("Acceso denegado.");

    const membership = await this.store.getMembership(user.userId, slug);
    if (!membership || !required.includes(membership.role)) {
      throw new ForbiddenException(
        `Requiere rol: ${required.join(", ")} en este workspace.`,
      );
    }
    return true;
  }
}
