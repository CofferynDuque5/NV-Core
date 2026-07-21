import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { getWorkspaceBySlug } from "@nv/domain";

import { AuthStore } from "../../auth/auth.store";
import type { AuthenticatedUser } from "../../auth/auth.types";

/**
 * Multi-tenancy guard. For a `:workspace` route it:
 *  1. validates the workspace exists (→ 404), and
 *  2. verifies the authenticated user is a member of it (→ 403).
 *
 * The global JwtAuthGuard runs first and populates `request.user`, so this
 * guard can rely on it being present for protected routes.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly store: AuthStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ params: { workspace?: string }; user?: AuthenticatedUser }>();
    const slug = request.params.workspace;

    if (!slug || !getWorkspaceBySlug(slug)) {
      throw new NotFoundException(`Workspace "${slug ?? ""}" no encontrado`);
    }

    const user = request.user;
    if (!user) throw new ForbiddenException("Autenticación requerida.");

    const membership = await this.store.getMembership(user.userId, slug);
    if (!membership) {
      throw new ForbiddenException("No perteneces a este workspace.");
    }
    return true;
  }
}
