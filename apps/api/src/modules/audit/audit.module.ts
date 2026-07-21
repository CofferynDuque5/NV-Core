import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuditLogEntry } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapAuditLog } from "../../prisma/mappers";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logs(workspaceId: string): Promise<AuditLogEntry[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.auditLog.findMany({
      where: { workspaceSlug: workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(mapAuditLog);
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
