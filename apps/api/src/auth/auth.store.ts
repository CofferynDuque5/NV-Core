import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Role } from "@nv/domain";

import type { MembershipRecord, UserRecord } from "./auth.types";

/**
 * In-memory identity store (users + workspace memberships).
 *
 * Starts EMPTY — no seeded/fake accounts. Every record comes from a real
 * register/invite action and lives for the process lifetime. This is the
 * no-database backing so auth is demonstrable today.
 *
 * Phase 2b: swap this for a Prisma-backed repository (the `User` and
 * `Membership` models already exist in schema.prisma). The AuthService depends
 * only on these method signatures, so nothing else changes.
 */
@Injectable()
export class AuthStore {
  private readonly users = new Map<string, UserRecord>();
  private readonly memberships: MembershipRecord[] = [];

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const normalized = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) return user;
    }
    return undefined;
  }

  async findUserById(id: string): Promise<UserRecord | undefined> {
    return this.users.get(id);
  }

  async createUser(input: { email: string; name: string; passwordHash: string }): Promise<UserRecord> {
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async membershipsOf(userId: string): Promise<MembershipRecord[]> {
    return this.memberships.filter((m) => m.userId === userId);
  }

  async membershipsOfWorkspace(workspaceSlug: string): Promise<MembershipRecord[]> {
    return this.memberships.filter((m) => m.workspaceSlug === workspaceSlug);
  }

  /** Members of a workspace, joined with their user record. */
  async listWorkspaceMembers(
    workspaceSlug: string,
  ): Promise<Array<{ user: UserRecord; role: MembershipRecord["role"] }>> {
    const result: Array<{ user: UserRecord; role: MembershipRecord["role"] }> = [];
    for (const m of this.memberships) {
      if (m.workspaceSlug !== workspaceSlug) continue;
      const user = this.users.get(m.userId);
      if (user) result.push({ user, role: m.role });
    }
    return result;
  }

  async getMembership(userId: string, workspaceSlug: string): Promise<MembershipRecord | undefined> {
    return this.memberships.find((m) => m.userId === userId && m.workspaceSlug === workspaceSlug);
  }

  async workspaceHasMembers(workspaceSlug: string): Promise<boolean> {
    return this.memberships.some((m) => m.workspaceSlug === workspaceSlug);
  }

  async upsertMembership(userId: string, workspaceSlug: string, role: Role): Promise<MembershipRecord> {
    const existing = this.memberships.find(
      (m) => m.userId === userId && m.workspaceSlug === workspaceSlug,
    );
    if (existing) {
      existing.role = role;
      return existing;
    }
    const record: MembershipRecord = { userId, workspaceSlug, role };
    this.memberships.push(record);
    return record;
  }
}
