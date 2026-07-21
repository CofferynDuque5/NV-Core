import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ROLE_DESCRIPTIONS, ROLE_ORDER, type RoleDefinition, type TeamMember } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class TeamService {
  async members(_workspaceId: string): Promise<TeamMember[]> {
    // No members until users are invited.
    return [];
  }

  async roles(_workspaceId: string): Promise<RoleDefinition[]> {
    // Role definitions are structural policy; membership counts start at 0.
    return ROLE_ORDER.map((role) => ({
      id: role,
      name: role,
      description: ROLE_DESCRIPTIONS[role],
      userCount: 0,
    }));
  }
}

@ApiTags("team")
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
