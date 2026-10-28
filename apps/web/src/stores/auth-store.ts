
import { create } from "zustand";

import {
  AuthError,
  authClient,
  type AuthUser,
  type LoginInput,
  type Membership,
  type RegisterInput,
} from "@/services/auth-client";
import { isBackendConfigured } from "@/lib/env";

type Status = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: Status;
  /** Access token kept in memory only (never localStorage) — short-lived. */
  token: string | null;
  user: AuthUser | null;
  memberships: Membership[];
  /** Platform super-admin (controls all users/roles). */
  superAdmin: boolean;

  /** Restore the session from the httpOnly refresh cookie (call once on mount). */
  hydrate: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  /** Rotate the refresh cookie and return a fresh access token (throws on failure). */
  refreshSession: () => Promise<string>;

  hasMembership: (workspaceSlug: string) => boolean;

  /** Profile page: change the display name. */
  updateName: (name: string) => Promise<void>;
  /** Profile page: change the password (other sessions are closed). */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Runs an authenticated call, renewing the session once on 401. */
  withToken: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  token: null,
  user: null,
  memberships: [],
  superAdmin: false,

  hydrate: async () => {
    if (!isBackendConfigured()) {
      set({ status: "unauthenticated" });
      return;
    }
    // Already signed in this session (e.g. just after register/login) — don't
    // reset to loading or re-fetch.
    if (get().status === "authenticated" && get().token) return;
    set({ status: "loading" });
    try {
      const res = await authClient.refresh();
      set({
        status: "authenticated",
        token: res.accessToken,
        user: res.user,
        memberships: res.memberships,
        superAdmin: res.superAdmin,
      });
    } catch {
      set({ status: "unauthenticated", token: null, user: null, memberships: [], superAdmin: false });
    }
  },

  login: async (input) => {
    const res = await authClient.login(input);
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
      superAdmin: res.superAdmin,
    });
  },

  register: async (input) => {
    const res = await authClient.register(input);
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
      superAdmin: res.superAdmin,
    });
  },

  logout: () => {
    void authClient.logout().catch(() => undefined);
    set({ status: "unauthenticated", token: null, user: null, memberships: [], superAdmin: false });
  },

  refreshSession: async () => {
    const res = await authClient.refresh();
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
      superAdmin: res.superAdmin,
    });
    return res.accessToken;
  },

  hasMembership: (workspaceSlug) => get().memberships.some((m) => m.workspaceSlug === workspaceSlug),

  withToken: async (fn) => {
    const token = get().token ?? (await get().refreshSession());
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof AuthError) || err.status !== 401) throw err;
      return fn(await get().refreshSession());
    }
  },

  updateName: async (name) => {
    const res = await get().withToken((t) => authClient.updateProfile(t, name));
    set({ user: res.user, memberships: res.memberships, superAdmin: res.superAdmin });
  },

  changePassword: async (currentPassword, newPassword) => {
    const res = await get().withToken((t) => authClient.changePassword(t, currentPassword, newPassword));
    set({ token: res.accessToken, user: res.user, memberships: res.memberships, superAdmin: res.superAdmin });
  },
}));
