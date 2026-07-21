import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedUser, JwtPayload } from "../auth.types";

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

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = { userId: payload.sub, email: payload.email, name: payload.name };
      return true;
    } catch {
      throw new UnauthorizedException("Token inválido o expirado.");
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
