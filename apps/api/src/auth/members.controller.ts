import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { TeamMember } from "@nv/domain";

import { WorkspaceGuard } from "../common/tenant/workspace.guard";
import { WorkspaceId } from "../common/tenant/workspace.decorator";
import { AuthService } from "./auth.service";
import { AuthStore } from "./auth.store";
import { RolesGuard } from "./guards/roles.guard";
import { Roles } from "./decorators/roles.decorator";
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
  add(@WorkspaceId() workspaceId: string, @Body() dto: AddMemberDto) {
    return this.auth.addMember(workspaceId, dto.email, dto.role);
  }
}
