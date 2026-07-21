import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { MediaAsset, MediaFolder } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class MediaService {
  async folders(_workspaceId: string): Promise<MediaFolder[]> {
    return [];
  }

  async assets(_workspaceId: string, _folderId?: string): Promise<ListResultDto<MediaAsset>> {
    return ListResultDto.empty<MediaAsset>();
  }
}

@ApiTags("media")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/media")
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Get("folders")
  folders(@WorkspaceId() workspaceId: string) {
    return this.service.folders(workspaceId);
  }

  @Get("assets")
  assets(@WorkspaceId() workspaceId: string, @Query("folderId") folderId?: string) {
    return this.service.assets(workspaceId, folderId);
  }
}

@Module({ controllers: [MediaController], providers: [MediaService] })
export class MediaModule {}
