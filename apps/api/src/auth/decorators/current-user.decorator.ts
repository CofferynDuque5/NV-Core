import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth.types";

/** Injects the authenticated user attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
