import { Controller, Get, Global, HttpCode, Module, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { WorkspaceId } from "../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../common/tenant/workspace.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { EventBus } from "./events/event-bus.service";
import { QueueManager } from "./queue/queue-manager.service";
import { JobManager } from "./jobs/job-manager.service";

/**
 * Read/administer async jobs (state, retries, failures).
 */
@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/jobs")
export class JobsController {
  constructor(private readonly jobs: JobManager) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query("status") status?: string) {
    return this.jobs.list(workspaceId, status);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.jobs.get(workspaceId, id);
  }

  @Post(":id/retry")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  retry(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.jobs.retry(workspaceId, id);
  }
}

/**
 * Core infrastructure available app-wide: internal Event Bus, Queue Manager
 * (async processing) and Job Manager (state, retries, failures).
 */
@Global()
@Module({
  controllers: [JobsController],
  providers: [EventBus, QueueManager, JobManager],
  exports: [EventBus, QueueManager, JobManager],
})
export class CoreModule {}
