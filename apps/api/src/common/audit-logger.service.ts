import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Writes audit entries for mutating actions. Best-effort: a logging failure
 * never breaks the underlying operation. Surfaces in GET /audit/logs.
 */
@Injectable()
export class AuditLogger {
  private readonly logger = new Logger(AuditLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(workspaceSlug: string, actor: string, action: string, target?: string): Promise<void> {
    if (!this.prisma.enabled) return;
    try {
      await this.prisma.auditLog.create({ data: { workspaceSlug, actor, action, target } });
    } catch (err) {
      this.logger.warn(`No se pudo registrar auditoría: ${(err as Error).message}`);
    }
  }
}
