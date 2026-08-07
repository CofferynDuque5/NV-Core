import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";
import type { AuthStore } from "./auth.store";
import { hashToken } from "./token.util";
import { hashPassword } from "./password.util";

/** Minimal in-memory AuthStore fake for the token flows. */
function makeStore() {
  const users = new Map<string, { id: string; email: string; name: string; passwordHash: string }>();
  users.set("u1@x.com", { id: "u1", email: "u1@x.com", name: "Uno", passwordHash: "old" });
  const tokens = new Map<string, { userId: string; purpose: string; usedAt: Date | null }>();
  const state = { passwordUpdatedFor: null as string | null, revokedFor: null as string | null, verified: null as string | null };

  const store = {
    findUserByEmail: vi.fn(async (email: string) => users.get(email)),
    createAuthToken: vi.fn(async (userId: string, purpose: string, tokenHash: string) => {
      for (const [h, t] of tokens) if (t.userId === userId && t.purpose === purpose) tokens.delete(h);
      tokens.set(tokenHash, { userId, purpose, usedAt: null });
    }),
    consumeAuthToken: vi.fn(async (tokenHash: string, purpose: string) => {
      const t = tokens.get(tokenHash);
      if (!t || t.purpose !== purpose || t.usedAt) return undefined;
      t.usedAt = new Date();
      return { userId: t.userId };
    }),
    updatePassword: vi.fn(async (userId: string) => {
      state.passwordUpdatedFor = userId;
    }),
    revokeAllRefreshTokens: vi.fn(async (userId: string) => {
      state.revokedFor = userId;
    }),
    setEmailVerified: vi.fn(async (userId: string) => {
      state.verified = userId;
    }),
  };
  return { store, state, tokens };
}

function makeService(store: unknown) {
  const mail = {
    send: vi.fn(async (_input: { to: string; subject: string; html: string }) => ({
      sent: true as const,
    })),
  };
  const config = { get: vi.fn(() => "http://app") };
  const svc = new AuthService(
    store as unknown as AuthStore,
    {} as never,
    config as never,
    mail as never,
  );
  return { svc, mail };
}

function tokenFromEmail(html: string): string {
  return new URL(html.match(/href="([^"]+)"/)![1]!).searchParams.get("token")!;
}

describe("AuthService password reset", () => {
  it("emails a link and resets the password, revoking sessions", async () => {
    const { store, state } = makeStore();
    const { svc, mail } = makeService(store);

    await svc.requestPasswordReset("u1@x.com");
    const raw = tokenFromEmail(mail.send.mock.calls[0]![0].html);

    await svc.resetPassword(raw, "BrandNewPass1");
    expect(state.passwordUpdatedFor).toBe("u1");
    expect(state.revokedFor).toBe("u1");
    // Token is single-use.
    await expect(svc.resetPassword(raw, "again12345")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not reveal unknown emails and sends nothing", async () => {
    const { store } = makeStore();
    const { svc, mail } = makeService(store);
    await expect(svc.requestPasswordReset("ghost@x.com")).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("rejects an invalid reset token", async () => {
    const { store } = makeStore();
    const { svc } = makeService(store);
    await expect(svc.resetPassword("nope", "whatever12")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AuthService login lockout", () => {
  const PASSWORD = "Correct-Pass-1";

  async function makeLoginService(overrides: { failedLoginAttempts?: number; lockedUntil?: string | null } = {}) {
    const passwordHash = await hashPassword(PASSWORD);
    const user = {
      id: "u1",
      email: "u1@x.com",
      name: "Uno",
      passwordHash,
      createdAt: new Date(0).toISOString(),
      failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
      lockedUntil: overrides.lockedUntil ?? null,
    };
    const calls = { increments: 0, locked: null as Date | null, cleared: false };
    const store = {
      findUserByEmail: vi.fn(async () => user),
      incrementFailedLogins: vi.fn(async () => ++calls.increments + (overrides.failedLoginAttempts ?? 0)),
      lockUser: vi.fn(async (_id: string, until: Date) => {
        calls.locked = until;
      }),
      clearFailedLogins: vi.fn(async () => {
        calls.cleared = true;
      }),
      membershipsOf: vi.fn(async () => []),
      createRefreshToken: vi.fn(async () => undefined),
    };
    const jwt = { signAsync: vi.fn(async () => "access-token") };
    const config = { get: vi.fn(() => ({ refreshTtlDays: 7 })) };
    const svc = new AuthService(store as unknown as AuthStore, jwt as never, config as never, {} as never);
    return { svc, store, calls };
  }

  it("rejects with 429 while the account is locked (even with the right password)", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const { svc, store } = await makeLoginService({ lockedUntil: future });
    try {
      await svc.login({ email: "u1@x.com", password: PASSWORD });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
    // Locked out short-circuits before verifying the password.
    expect(store.incrementFailedLogins).not.toHaveBeenCalled();
  });

  it("counts a wrong password and locks on the 5th failure", async () => {
    // Already 4 prior failures; this wrong attempt is the 5th → lock.
    const { svc, store, calls } = await makeLoginService({ failedLoginAttempts: 4 });
    await expect(svc.login({ email: "u1@x.com", password: "wrong" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(store.incrementFailedLogins).toHaveBeenCalledTimes(1);
    expect(calls.locked).toBeInstanceOf(Date);
  });

  it("does not lock before the threshold", async () => {
    const { svc, store } = await makeLoginService({ failedLoginAttempts: 0 });
    await expect(svc.login({ email: "u1@x.com", password: "wrong" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(store.lockUser).not.toHaveBeenCalled();
  });

  it("clears failures on a successful login", async () => {
    const { svc, store, calls } = await makeLoginService({ failedLoginAttempts: 3 });
    const res = await svc.login({ email: "u1@x.com", password: PASSWORD });
    expect(res.accessToken).toBe("access-token");
    expect(store.clearFailedLogins).toHaveBeenCalledTimes(1);
    expect(calls.cleared).toBe(true);
  });

  it("expired lock is ignored (login proceeds, wrong password → 401)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { svc, store } = await makeLoginService({ lockedUntil: past, failedLoginAttempts: 1 });
    await expect(svc.login({ email: "u1@x.com", password: "wrong" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Not short-circuited by the (expired) lock — the password was checked.
    expect(store.incrementFailedLogins).toHaveBeenCalledTimes(1);
  });
});

describe("AuthService email verification", () => {
  it("verifies with a valid token and rejects reuse", async () => {
    const { store, state } = makeStore();
    const { svc, mail } = makeService(store);

    await svc.resendVerification("u1", "u1@x.com", "Uno");
    const raw = tokenFromEmail(mail.send.mock.calls[0]![0].html);

    await svc.verifyEmail(raw);
    expect(state.verified).toBe("u1");
    await expect(svc.verifyEmail(raw)).rejects.toBeInstanceOf(BadRequestException);
    expect(hashToken(raw)).toBeDefined();
  });
});
