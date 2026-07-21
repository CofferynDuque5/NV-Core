import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Template } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class TemplatesService {
  async list(_workspaceId: string): Promise<ListResultDto<Template>> {
    return ListResultDto.empty<Template>();
  }
}

@ApiTags("templates")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/templates")
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }
}

@Module({ controllers: [TemplatesController], providers: [TemplatesService] })
export class TemplatesModule {}
