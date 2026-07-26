import { Injectable } from "@nestjs/common";
import type { Role } from "@nv/domain";

import { PrismaService } from "../prisma/prisma.service";
import type { MembershipRecord, UserRecord } from "./auth.types";

/**
 * Identity store backed by Prisma/PostgreSQL (User + Membership tables).
 *
 * Starts empty — no seeded accounts. All records come from real
 * register/invite actions and persist across restarts. The AuthService depends
 * only on these method signatures.
 */
@Injectable()
export class AuthStore {
  constructor(private readonly prisma: PrismaService) {}

  private toUser(u: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    createdAt: Date;
  }): UserRecord {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    };
  }

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return u ? this.toUser(u) : undefined;
  }

  async findUserById(id: string): Promise<UserRecord | undefined> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    return u ? this.toUser(u) : undefined;
  }

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    const u = await this.prisma.user.create({
      data: { email: input.email.toLowerCase(), name: input.name, passwordHash: input.passwordHash },
    });
    return this.toUser(u);
  }

  async membershipsOf(userId: string): Promise<MembershipRecord[]> {
    const rows = await this.prisma.membership.findMany({ where: { userId } });
    return rows.map((m) => ({ userId: m.userId, workspaceSlug: m.workspaceSlug, role: m.role as Role }));
  }

  async membershipsOfWorkspace(workspaceSlug: string): Promise<MembershipRecord[]> {
    const rows = await this.prisma.membership.findMany({ where: { workspaceSlug } });
    return rows.map((m) => ({ userId: m.userId, workspaceSlug: m.workspaceSlug, role: m.role as Role }));
  }

  /** Members of a workspace, joined with their user record. */
  async listWorkspaceMembers(
    workspaceSlug: string,
  ): Promise<Array<{ user: UserRecord; role: Role }>> {
    const rows = await this.prisma.membership.findMany({
      where: { workspaceSlug },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((m) => ({ user: this.toUser(m.user), role: m.role as Role }));
  }

  async getMembership(userId: string, workspaceSlug: string): Promise<MembershipRecord | undefined> {
    const m = await this.prisma.membership.findUnique({
      where: { userId_workspaceSlug: { userId, workspaceSlug } },
    });
    return m ? { userId: m.userId, workspaceSlug: m.workspaceSlug, role: m.role as Role } : undefined;
  }

  async workspaceHasMembers(workspaceSlug: string): Promise<boolean> {
    const count = await this.prisma.membership.count({ where: { workspaceSlug } });
    return count > 0;
  }

  async upsertMembership(userId: string, workspaceSlug: string, role: Role): Promise<MembershipRecord> {
    const m = await this.prisma.membership.upsert({
      where: { userId_workspaceSlug: { userId, workspaceSlug } },
      create: { userId, workspaceSlug, role },
      update: { role },
    });
    return { userId: m.userId, workspaceSlug: m.workspaceSlug, role: m.role as Role };
  }

  async removeMembership(userId: string, workspaceSlug: string): Promise<number> {
    const { count } = await this.prisma.membership.deleteMany({ where: { userId, workspaceSlug } });
    return count;
  }

  // ── Refresh tokens ──────────────────────────────────────────────────────────
  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  async findValidRefreshToken(
    tokenHash: string,
  ): Promise<{ id: string; userId: string } | undefined> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) return undefined;
    return { id: row.id, userId: row.userId };
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
