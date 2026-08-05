
import { create } from "zustand";

import {
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

  /** Restore the session from the httpOnly refresh cookie (call once on mount). */
  hydrate: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  /** Rotate the refresh cookie and return a fresh access token (throws on failure). */
  refreshSession: () => Promise<string>;

  hasMembership: (workspaceSlug: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  token: null,
  user: null,
  memberships: [],

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
      });
    } catch {
      set({ status: "unauthenticated", token: null, user: null, memberships: [] });
    }
  },

  login: async (input) => {
    const res = await authClient.login(input);
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
    });
  },

  register: async (input) => {
    const res = await authClient.register(input);
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
    });
  },

  logout: () => {
    void authClient.logout().catch(() => undefined);
    set({ status: "unauthenticated", token: null, user: null, memberships: [] });
  },

  refreshSession: async () => {
    const res = await authClient.refresh();
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
    });
    return res.accessToken;
  },

  hasMembership: (workspaceSlug) => get().memberships.some((m) => m.workspaceSlug === workspaceSlug),
}));
