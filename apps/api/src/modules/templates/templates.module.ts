import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Template } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapTemplate } from "../../prisma/mappers";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ListResultDto<Template>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Template>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.template.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.template.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapTemplate), total);
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
