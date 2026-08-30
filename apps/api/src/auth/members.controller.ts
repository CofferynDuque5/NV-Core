import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { TeamInvitation, TeamMember } from "@nv/domain";

import { WorkspaceGuard } from "../common/tenant/workspace.guard";
import { WorkspaceId } from "../common/tenant/workspace.decorator";
import { AuthService } from "./auth.service";
import { AuthStore } from "./auth.store";
import { RolesGuard } from "./guards/roles.guard";
import { Roles } from "./decorators/roles.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthenticatedUser } from "./auth.types";
import { AddMemberDto } from "./dto/add-member.dto";
import { toTeamMember } from "./member.mapper";

/**
 * Workspace membership management. All routes require authentication (global
 * guard) + membership (WorkspaceGuard). Adding members is restricted to
 * Owner/Admin via RolesGuard.
 */
@ApiTags("members")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/members")
export class MembersController {
  constructor(
    private readonly auth: AuthService,
    private readonly store: AuthStore,
  ) {}

  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<TeamMember[]> {
    const rows = await this.store.listWorkspaceMembers(workspaceId);
    return rows.map(({ user, role }) => toTeamMember(user, role));
  }

  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @Post()
  add(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.auth.addMember(workspaceId, user.userId, dto.email, dto.role);
  }

  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @Delete(":userId")
  @HttpCode(204)
  remove(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") userId: string,
  ) {
    return this.auth.removeMember(workspaceId, user.userId, userId);
  }

  /** Pending invitations for emails that haven't registered yet. */
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @Get("invitations")
  async invitations(@WorkspaceId() workspaceId: string): Promise<TeamInvitation[]> {
    const rows = await this.auth.listInvitations(workspaceId);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      invitedByName: r.invitedByName,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @Delete("invitations/:id")
  @HttpCode(204)
  revokeInvitation(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.auth.revokeInvitation(workspaceId, id);
  }
}
