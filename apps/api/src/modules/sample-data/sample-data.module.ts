import { Controller, Delete, Get, HttpCode, Module, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { SampleDataService } from "../../common/sample-data.service";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";

/** Lets a brand see and remove the example records older versions loaded into it. */
@ApiTags("sample-data")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/sample-data")
export class SampleDataController {
  constructor(private readonly samples: SampleDataService) {}

  @Get()
  summary(@WorkspaceId() workspaceId: string) {
    return this.samples.summary(workspaceId);
  }

  @Delete()
  @HttpCode(200)
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  remove(@WorkspaceId() workspaceId: string) {
    return this.samples.remove(workspaceId);
  }
}

@Module({ controllers: [SampleDataController] })
export class SampleDataModule {}
