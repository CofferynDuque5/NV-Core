"use client";

import { create } from "zustand";

import {
  authClient,
  type AuthUser,
  type LoginInput,
  type Membership,
  type RegisterInput,
} from "@/services/auth-client";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth-storage";
import { isBackendConfigured } from "@/lib/env";

type Status = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: Status;
  token: string | null;
  user: AuthUser | null;
  memberships: Membership[];

  /** Restore session from a stored token (call once on mount). */
  hydrate: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;

  hasMembership: (workspaceSlug: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  token: null,
  user: null,
  memberships: [],

  hydrate: async () => {
    // Demo mode (no backend): nothing to authenticate.
    if (!isBackendConfigured()) {
      set({ status: "unauthenticated" });
      return;
    }
    const token = getStoredToken();
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }
    set({ status: "loading", token });
    try {
      const res = await authClient.me(token);
      set({
        status: "authenticated",
        token,
        user: res.user,
        memberships: res.memberships,
      });
    } catch {
      clearStoredToken();
      set({ status: "unauthenticated", token: null, user: null, memberships: [] });
    }
  },

  login: async (input) => {
    const res = await authClient.login(input);
    setStoredToken(res.accessToken);
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
    });
  },

  register: async (input) => {
    const res = await authClient.register(input);
    setStoredToken(res.accessToken);
    set({
      status: "authenticated",
      token: res.accessToken,
      user: res.user,
      memberships: res.memberships,
    });
  },

  logout: () => {
    clearStoredToken();
    set({ status: "unauthenticated", token: null, user: null, memberships: [] });
  },

  hasMembership: (workspaceSlug) => get().memberships.some((m) => m.workspaceSlug === workspaceSlug),
}));
