import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Segment } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapSegment } from "../../prisma/mappers";

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ListResultDto<Segment>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Segment>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.segment.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.segment.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapSegment), total);
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
