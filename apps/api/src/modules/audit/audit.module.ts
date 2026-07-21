import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuditLogEntry } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class AuditService {
  async logs(_workspaceId: string): Promise<AuditLogEntry[]> {
    return [];
  }
}

@ApiTags("audit")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/audit")
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get("logs")
  logs(@WorkspaceId() workspaceId: string) {
    return this.service.logs(workspaceId);
  }
}

@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}
