import type { Role } from "@nv/domain";

/** A user record (password hash never leaves the store). */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  /** Consecutive failed logins (0 when clean). */
  failedLoginAttempts: number;
  /** ISO time until which logins are locked, or null. */
  lockedUntil: string | null;
}

/** A user's membership in a workspace, with their role. */
export interface MembershipRecord {
  userId: string;
  workspaceSlug: string;
  role: Role;
}

/** JWT payload. */
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

/** What guards attach to `request.user`. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
}

/** Public shape of a user (no secrets). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface MembershipView {
  workspaceSlug: string;
  role: Role;
}
