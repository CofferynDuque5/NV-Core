import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuthStore } from "../../auth/auth.store";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AppConfig } from "../../config/configuration";
import { OPEN_WHEN_EXPIRED, routeSection } from "../access/workspace-access";
import { WorkspaceAccessService } from "../access/workspace-access.service";
import { WorkspaceRegistry } from "../workspace-registry.service";

/**
 * Multi-tenancy guard. For a `:workspace` route it:
 *  1. validates the workspace exists (→ 404), and
 *  2. verifies the authenticated user is a member of it (→ 403), and
 *  3. once a customer brand's free trial (or paid time) is over, answers 402
 *     on everything except its access/billing routes, so the panel can still
 *     show how to pay. Platform super-admins are never locked out.
 *
 * The global JwtAuthGuard runs first and populates `request.user`, so this
 * guard can rely on it being present for protected routes.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly store: AuthStore,
    private readonly registry: WorkspaceRegistry,
    private readonly access: WorkspaceAccessService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ params: { workspace?: string }; user?: AuthenticatedUser; originalUrl?: string; url?: string }>();
    const slug = request.params.workspace;

    if (!slug || !(await this.registry.exists(slug))) {
      throw new NotFoundException(`Workspace "${slug ?? ""}" no encontrado`);
    }

    const user = request.user;
    if (!user) throw new ForbiddenException("Autenticación requerida.");

    const membership = await this.store.getMembership(user.userId, slug);
    if (!membership) {
      throw new ForbiddenException("No perteneces a este workspace.");
    }

    const section = routeSection(request.originalUrl ?? request.url ?? "", slug);
    if (section === undefined || OPEN_WHEN_EXPIRED.has(section)) return true;
    if ((await this.access.state(slug)).state !== "expired") return true;
    if (this.config.get("superAdmins", { infer: true }).includes(user.email.toLowerCase())) return true;
    throw new HttpException(
      { statusCode: HttpStatus.PAYMENT_REQUIRED, code: "trial_expired", message: "Tu prueba gratis terminó. Activa tu plan para seguir usando el panel." },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
