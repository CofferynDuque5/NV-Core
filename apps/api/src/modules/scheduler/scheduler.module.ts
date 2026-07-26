import { Global, Module } from "@nestjs/common";

import { PostScheduler } from "./post-scheduler.service";

/** Provides the background post scheduler (BullMQ) app-wide. */
@Global()
@Module({
  providers: [PostScheduler],
  exports: [PostScheduler],
})
export class SchedulerModule {}
