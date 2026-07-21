import { Controller, Get, Injectable, Module, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Connection } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapConnection } from "../../prisma/mappers";

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<Connection[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.connection.findMany({
      where: { workspaceSlug: workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapConnection);
  }

  async get(workspaceId: string, id: string): Promise<Connection | null> {
    if (!this.prisma.enabled) return null;
    const row = await this.prisma.connection.findFirst({
      where: { id, workspaceSlug: workspaceId },
    });
    return row ? mapConnection(row) : null;
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
