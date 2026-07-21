import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Integration } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class IntegrationsService {
  async catalog(_workspaceId: string): Promise<Integration[]> {
    return [];
  }
}

@ApiTags("integrations")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/integrations")
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  catalog(@WorkspaceId() workspaceId: string) {
    return this.service.catalog(workspaceId);
  }
}

@Module({ controllers: [IntegrationsController], providers: [IntegrationsService] })
export class IntegrationsModule {}
