import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedUser, JwtPayload } from "../auth.types";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Shown when a demo visitor tries to change something. */
export const DEMO_READ_ONLY =
  "Estás viendo la demo: aquí no se guardan cambios. Crea tu cuenta gratis para usar el panel con tu marca.";

/**
 * Global authentication guard. Validates the `Authorization: Bearer <jwt>`
 * header and attaches `request.user`. Routes marked `@Public()` bypass it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException("Falta el token de autenticación.");

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Token inválido o expirado.");
    }
    request.user = { userId: payload.sub, email: payload.email, name: payload.name, demo: payload.demo === true };
    // The «Ver demo» account looks at everything and changes nothing.
    if (payload.demo === true && !READ_METHODS.has(request.method.toUpperCase())) {
      throw new ForbiddenException(DEMO_READ_ONLY);
    }
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
