import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { getWorkspaceBySlug } from "@nv/domain";

/**
 * Multi-tenancy guard. Validates the `:workspace` route param against the
 * known workspaces. Rejects unknown tenants with 404 before any handler runs.
 *
 * Phase 2b: this will also verify the authenticated user is a member of the
 * workspace (RBAC) once auth is wired.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ params: { workspace?: string } }>();
    const slug = request.params.workspace;

    if (!slug || !getWorkspaceBySlug(slug)) {
      throw new NotFoundException(`Workspace "${slug ?? ""}" no encontrado`);
    }
    return true;
  }
}
