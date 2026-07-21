import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Automation } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapAutomation } from "../../prisma/mappers";

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ListResultDto<Automation>> {
    // Execution is orchestrated via n8n (phase 2b); definitions live in Postgres.
    if (!this.prisma.enabled) return ListResultDto.empty<Automation>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.automation.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.automation.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapAutomation), total);
  }
}

@ApiTags("automations")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/automations")
export class AutomationsController {
  constructor(private readonly service: AutomationsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }
}

@Module({ controllers: [AutomationsController], providers: [AutomationsService] })
export class AutomationsModule {}
