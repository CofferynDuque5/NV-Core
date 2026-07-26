import { Global, Module } from "@nestjs/common";

import { WorkspaceGuard } from "./tenant/workspace.guard";
import { AuditLogger } from "./audit-logger.service";
import { MailService } from "./mail.service";

/** Cross-cutting providers available app-wide. */
@Global()
@Module({
  providers: [WorkspaceGuard, AuditLogger, MailService],
  exports: [WorkspaceGuard, AuditLogger, MailService],
})
export class CommonModule {}
