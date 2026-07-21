import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Segment } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class SegmentsService {
  async list(_workspaceId: string): Promise<ListResultDto<Segment>> {
    return ListResultDto.empty<Segment>();
  }
}

@ApiTags("segments")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/segments")
export class SegmentsController {
  constructor(private readonly service: SegmentsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }
}

@Module({ controllers: [SegmentsController], providers: [SegmentsService] })
export class SegmentsModule {}
