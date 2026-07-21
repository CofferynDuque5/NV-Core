import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Post } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapPost } from "../../prisma/mappers";

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ListResultDto<Post>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Post>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        include: { campaign: { select: { name: true } } },
      }),
      this.prisma.post.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapPost), total);
  }

  async today(workspaceId: string): Promise<Post[]> {
    if (!this.prisma.enabled) return [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const rows = await this.prisma.post.findMany({
      where: { workspaceSlug: workspaceId, scheduledAt: { gte: start, lt: end } },
      orderBy: { scheduledAt: "asc" },
      include: { campaign: { select: { name: true } } },
    });
    return rows.map(mapPost);
  }
}

@ApiTags("posts")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/posts")
export class PostsController {
  constructor(private readonly service: PostsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get("today")
  today(@WorkspaceId() workspaceId: string) {
    return this.service.today(workspaceId);
  }
}

@Module({ controllers: [PostsController], providers: [PostsService] })
export class PostsModule {}
