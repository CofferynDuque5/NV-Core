import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { JwtAuthGuard } from "./jwt-auth.guard";

function ctx(method: string, demo: boolean) {
  const request: Record<string, any> = { method, headers: { authorization: "Bearer t" } };
  const guard = new JwtAuthGuard(
    { verifyAsync: vi.fn(async () => ({ sub: "u1", email: "e", name: "n", ...(demo ? { demo: true } : {}) })) } as never,
    { getAllAndOverride: vi.fn(() => false) } as never,
  );
  const context = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) };
  return { guard, context: context as never, request };
}

describe("JwtAuthGuard · demo", () => {
  it("lets the demo look at everything", async () => {
    const { guard, context, request } = ctx("GET", true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ userId: "u1", demo: true });
  });

  it("refuses every change from the demo", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const { guard, context } = ctx(method, true);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it("real accounts can still write", async () => {
    const { guard, context } = ctx("POST", false);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
