import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Post } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class PostsService {
  async list(_workspaceId: string): Promise<ListResultDto<Post>> {
    return ListResultDto.empty<Post>();
  }

  async today(_workspaceId: string): Promise<Post[]> {
    return [];
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
