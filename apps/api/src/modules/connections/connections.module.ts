import { Controller, Get, Injectable, Module, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Connection } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class ConnectionsService {
  async list(_workspaceId: string): Promise<Connection[]> {
    return [];
  }

  async get(_workspaceId: string, _id: string): Promise<Connection | null> {
    return null;
  }
}

@ApiTags("connections")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/connections")
export class ConnectionsController {
  constructor(private readonly service: ConnectionsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
  }
}

@Module({ controllers: [ConnectionsController], providers: [ConnectionsService] })
export class ConnectionsModule {}
