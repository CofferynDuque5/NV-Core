import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { MediaAsset, MediaFolder } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapMediaAsset, mapMediaFolder } from "../../prisma/mappers";

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async folders(workspaceId: string): Promise<MediaFolder[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.mediaFolder.findMany({
      where: { workspaceSlug: workspaceId },
      include: { _count: { select: { assets: true } } },
      orderBy: { label: "asc" },
    });
    return rows.map(mapMediaFolder);
  }

  async assets(workspaceId: string, folderId?: string): Promise<ListResultDto<MediaAsset>> {
    if (!this.prisma.enabled) return ListResultDto.empty<MediaAsset>();
    const where = { workspaceSlug: workspaceId, ...(folderId ? { folderId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapMediaAsset), total);
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
