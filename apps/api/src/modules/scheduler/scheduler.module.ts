import { Global, Module } from "@nestjs/common";

import { ProvidersModule } from "../../providers/providers.module";
import { PostScheduler } from "./post-scheduler.service";

/** Provides the post scheduler (queue job + database sweep) app-wide. */
@Global()
@Module({
  imports: [ProvidersModule],
  providers: [PostScheduler],
  exports: [PostScheduler],
})
export class SchedulerModule {}
