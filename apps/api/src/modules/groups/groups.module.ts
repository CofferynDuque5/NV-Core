import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Group } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class GroupsService {
  async list(_workspaceId: string): Promise<ListResultDto<Group>> {
    return ListResultDto.empty<Group>();
  }
}

@ApiTags("groups")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/groups")
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }
}

@Module({ controllers: [GroupsController], providers: [GroupsService] })
export class GroupsModule {}
