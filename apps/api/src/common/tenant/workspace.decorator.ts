import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/**
 * Injects the resolved workspace slug (tenant) from the route.
 * The `WorkspaceGuard` guarantees it exists and is valid.
 */
export const WorkspaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ params: { workspace?: string } }>();
    return request.params.workspace ?? "";
  },
);
