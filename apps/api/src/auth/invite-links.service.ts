import { ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { InviteLink, InviteLinkPreview, Role } from "@nv/domain";

import type { AppConfig } from "../config/configuration";
import { PlanService } from "../common/plan/plan.service";
import { WorkspaceRegistry } from "../common/workspace-registry.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthStore } from "./auth.store";
import { generateRefreshToken, hashToken } from "./token.util";

const DAY_MS = 24 * 60 * 60 * 1000;

interface LinkRow {
  id: string;
  workspaceSlug: string;
  role: string;
  createdByName: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Why a link can't be used any more, or null while it works. */
export function inviteLinkProblem(row: Pick<LinkRow, "revokedAt" | "expiresAt" | "maxUses" | "uses">, now = new Date()): string | null {
  if (row.revokedAt) return "Este enlace fue desactivado. Pide uno nuevo a quien te invitó.";
  if (row.expiresAt.getTime() <= now.getTime()) return "Este enlace ya caducó. Pide uno nuevo a quien te invitó.";
  if (row.maxUses != null && row.uses >= row.maxUses) return "Este enlace ya se usó todas las veces permitidas.";
  return null;
}

/**
 * Shareable team invite links: an Owner/Admin creates a link with a role and an
 * expiry, sends it to teammates, and whoever opens it (signed in) joins the
 * brand with that role. Only the token's hash is stored.
 */
@Injectable()
export class InviteLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AuthStore,
    private readonly plans: PlanService,
    private readonly registry: WorkspaceRegistry,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private toLink(r: LinkRow): InviteLink {
    return {
      id: r.id,
      role: r.role as Role,
      createdByName: r.createdByName,
      maxUses: r.maxUses,
      uses: r.uses,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  }

  async create(
    workspaceSlug: string,
    actingUserId: string,
    input: { role: Role; days?: number; maxUses?: number },
  ): Promise<InviteLink & { url: string }> {
    if (input.role === "Owner") throw new ForbiddenException("Un enlace no puede dar el rol Owner.");
    const actor = await this.store.findUserById(actingUserId);
    const token = generateRefreshToken();
    const row = await this.prisma.inviteLink.create({
      data: {
        workspaceSlug,
        tokenHash: hashToken(token),
        role: input.role,
        createdByName: actor?.name ?? null,
        maxUses: input.maxUses ?? null,
        expiresAt: new Date(Date.now() + (input.days ?? 7) * DAY_MS),
      },
    });
    const url = `${this.config.get("appUrl", { infer: true })}/join/${token}`;
    return { ...this.toLink(row), url };
  }

  /** Links that still work. */
  async list(workspaceSlug: string): Promise<InviteLink[]> {
    const rows = await this.prisma.inviteLink.findMany({
      where: { workspaceSlug, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.filter((r) => inviteLinkProblem(r) === null).map((r) => this.toLink(r));
  }

  async revoke(workspaceSlug: string, id: string): Promise<void> {
    const { count } = await this.prisma.inviteLink.updateMany({
      where: { id, workspaceSlug, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw new NotFoundException("Enlace no encontrado.");
  }

  private async find(token: string): Promise<LinkRow> {
    const row = token ? await this.prisma.inviteLink.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
    if (!row) throw new NotFoundException("Este enlace de invitación no existe.");
    return row;
  }

  /** What the invite page shows before joining (no sign-in needed). */
  async preview(token: string): Promise<InviteLinkPreview> {
    const row = await this.find(token);
    const ws = await this.registry.resolve(row.workspaceSlug);
    const problem = inviteLinkProblem(row) ?? (ws ? null : "La marca de este enlace ya no existe.");
    return {
      workspaceSlug: row.workspaceSlug,
      workspaceName: ws?.name ?? row.workspaceSlug,
      role: row.role as Role,
      invitedByName: row.createdByName,
      expiresAt: row.expiresAt.toISOString(),
      problem,
    };
  }

  /**
   * Join the link's brand. Someone who is already a member keeps their role
   * (a link never lowers nor raises an existing role).
   */
  async accept(token: string, userId: string): Promise<{ workspaceSlug: string; role: Role; alreadyMember: boolean }> {
    const row = await this.find(token);
    const problem = inviteLinkProblem(row);
    if (problem) throw new GoneException(problem);
    if (!(await this.registry.resolve(row.workspaceSlug))) throw new GoneException("La marca de este enlace ya no existe.");

    const existing = await this.store.getMembership(userId, row.workspaceSlug);
    if (existing) return { workspaceSlug: row.workspaceSlug, role: existing.role, alreadyMember: true };

    await this.plans.assertWithinLimit(row.workspaceSlug, "teamMembers", 1);
    // Count the use first, guarded on the limit, so two people can't both take the last seat.
    const { count } = await this.prisma.inviteLink.updateMany({
      where: {
        id: row.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(row.maxUses != null ? { uses: { lt: row.maxUses } } : {}),
      },
      data: { uses: { increment: 1 } },
    });
    if (!count) throw new GoneException("Este enlace ya se usó todas las veces permitidas.");
    const role = row.role as Role;
    await this.store.upsertMembership(userId, row.workspaceSlug, role);
    return { workspaceSlug: row.workspaceSlug, role, alreadyMember: false };
  }
}
