import type { Role } from "@nv/domain";

import { API_URL } from "@/lib/env";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface Membership {
  workspaceSlug: string;
  role: Role;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
  memberships: Membership[];
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  workspaceSlug?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Thrown for non-2xx responses, carrying the API's message. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (data && typeof data.message === "string" && data.message) ||
      (Array.isArray(data?.message) && data.message.join(", ")) ||
      `Error ${res.status}`;
    throw new AuthError(message, res.status);
  }
  return data as T;
}

export const authClient = {
  register: (input: RegisterInput) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify(input) }),

  login: (input: LoginInput) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(input) }),

  me: (token: string) => request<AuthResult>("/auth/me", { token }),
};
