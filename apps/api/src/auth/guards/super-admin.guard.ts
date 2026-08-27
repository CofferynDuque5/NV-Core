import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../auth.types";

/**
 * Restricts a route to platform super-admins (emails in `superAdmins`, from
 * NV_SUPER_ADMINS / NV_ADMIN_EMAIL). Runs after the global auth guard, so
 * `request.user` is populated.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const email = request.user?.email?.toLowerCase();
    const admins = this.config.get("superAdmins", { infer: true });
    if (!email || !admins.includes(email)) {
      throw new ForbiddenException("Requiere super-admin de la plataforma.");
    }
    return true;
  }
}
