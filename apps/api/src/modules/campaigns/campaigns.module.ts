import { Controller, Get, Injectable, Module, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Campaign } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class CampaignsService {
  async list(_workspaceId: string): Promise<ListResultDto<Campaign>> {
    return ListResultDto.empty<Campaign>();
  }

  async get(_workspaceId: string, _id: string): Promise<Campaign | null> {
    return null;
  }
}

@ApiTags("campaigns")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/campaigns")
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.get(workspaceId, id);
  }
}

@Module({ controllers: [CampaignsController], providers: [CampaignsService] })
export class CampaignsModule {}
