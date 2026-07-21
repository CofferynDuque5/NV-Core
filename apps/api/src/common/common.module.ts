import { Global, Module } from "@nestjs/common";

import { WorkspaceGuard } from "./tenant/workspace.guard";
import { AuditLogger } from "./audit-logger.service";

/** Cross-cutting providers available app-wide. */
@Global()
@Module({
  providers: [WorkspaceGuard, AuditLogger],
  exports: [WorkspaceGuard, AuditLogger],
})
export class CommonModule {}
