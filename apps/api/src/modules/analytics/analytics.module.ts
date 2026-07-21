import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AnalyticsSnapshot } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class AnalyticsService {
  async snapshot(_workspaceId: string): Promise<AnalyticsSnapshot | null> {
    // No metrics fabricated — null until there is real activity to aggregate.
    return null;
  }
}

@ApiTags("analytics")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/analytics")
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  snapshot(@WorkspaceId() workspaceId: string) {
    return this.service.snapshot(workspaceId);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
