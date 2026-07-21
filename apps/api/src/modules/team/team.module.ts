import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ROLE_DESCRIPTIONS, ROLE_ORDER, type RoleDefinition, type TeamMember } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuthStore } from "../../auth/auth.store";
import { toTeamMember } from "../../auth/member.mapper";

@Injectable()
export class TeamService {
  constructor(private readonly store: AuthStore) {}

  async members(workspaceId: string): Promise<TeamMember[]> {
    const rows = await this.store.listWorkspaceMembers(workspaceId);
    return rows.map(({ user, role }) => toTeamMember(user, role));
  }

  async roles(workspaceId: string): Promise<RoleDefinition[]> {
    // Role definitions are structural policy; counts reflect real memberships.
    const rows = await this.store.listWorkspaceMembers(workspaceId);
    return ROLE_ORDER.map((role) => ({
      id: role,
      name: role,
      description: ROLE_DESCRIPTIONS[role],
      userCount: rows.filter((r) => r.role === role).length,
    }));
  }
}

@ApiTags("team")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/team")
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Get("members")
  members(@WorkspaceId() workspaceId: string) {
    return this.service.members(workspaceId);
  }

  @Get("roles")
  roles(@WorkspaceId() workspaceId: string) {
    return this.service.roles(workspaceId);
  }
}

@Module({ controllers: [TeamController], providers: [TeamService] })
export class TeamModule {}
