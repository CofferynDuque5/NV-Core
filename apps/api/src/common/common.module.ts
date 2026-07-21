import { Global, Module } from "@nestjs/common";

import { WorkspaceGuard } from "./tenant/workspace.guard";

/** Cross-cutting providers available app-wide. */
@Global()
@Module({
  providers: [WorkspaceGuard],
  exports: [WorkspaceGuard],
})
export class CommonModule {}
