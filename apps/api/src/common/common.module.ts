import { Global, Module } from "@nestjs/common";

import { WorkspaceGuard } from "./tenant/workspace.guard";
import { AuditLogger } from "./audit-logger.service";
import { MailService } from "./mail.service";
import { PlanGuard } from "./guards/plan.guard";

/** Cross-cutting providers available app-wide. */
@Global()
@Module({
  providers: [WorkspaceGuard, AuditLogger, MailService, PlanGuard],
  exports: [WorkspaceGuard, AuditLogger, MailService, PlanGuard],
})
export class CommonModule {}
