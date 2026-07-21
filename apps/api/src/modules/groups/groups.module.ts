import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Group } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapGroup } from "../../prisma/mappers";

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ListResultDto<Group>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Group>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.group.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.group.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapGroup), total);
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
