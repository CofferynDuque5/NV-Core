import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Automation } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class AutomationsService {
  async list(_workspaceId: string): Promise<ListResultDto<Automation>> {
    // TODO(phase 2): orchestrated via n8n.
    return ListResultDto.empty<Automation>();
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
