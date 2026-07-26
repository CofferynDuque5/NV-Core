import { Global, Module } from "@nestjs/common";

import { WorkspaceGuard } from "./tenant/workspace.guard";
import { AuditLogger } from "./audit-logger.service";
import { MailService } from "./mail.service";
import { PlanGuard } from "./guards/plan.guard";
import { WorkspaceRegistry } from "./workspace-registry.service";

/** Cross-cutting providers available app-wide. */
@Global()
@Module({
  providers: [WorkspaceGuard, AuditLogger, MailService, PlanGuard, WorkspaceRegistry],
  exports: [WorkspaceGuard, AuditLogger, MailService, PlanGuard, WorkspaceRegistry],
})
export class CommonModule {}
