import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import IORedis, { type Redis } from "ioredis";

import type { AppConfig } from "../../config/configuration";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";

const QUEUE = "posts";
const JOB = "publish-post";

interface PublishJob {
  postId: string;
}

/**
 * Background scheduler for timed publishing (BullMQ + Redis). Fully optional:
 * without REDIS_URL the queue is disabled and posts simply stay scheduled, so
 * the API boots and works with zero infra configured.
 */
@Injectable()
export class PostScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostScheduler.name);
  private readonly redisUrl?: string;
  private connection?: Redis;
  private queue?: Queue<PublishJob>;
  private worker?: Worker<PublishJob>;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {
    this.redisUrl = config.get("redis", { infer: true }).url;
  }

  get enabled(): boolean {
    return Boolean(this.queue);
  }

  onModuleInit(): void {
    if (!this.redisUrl) {
      this.logger.log("Scheduler deshabilitado (sin REDIS_URL). Los posts quedan programados.");
      return;
    }
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<PublishJob>(QUEUE, { connection: this.connection });
    this.worker = new Worker<PublishJob>(QUEUE, (job) => this.publish(job.data.postId), {
      connection: this.connection,
    });
    this.worker.on("failed", (job, err) =>
      this.logger.warn(`Job ${job?.id} falló: ${err.message}`),
    );
    this.logger.log("Scheduler de publicaciones activo (BullMQ).");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /**
   * Schedule a post for publishing at `runAt`. Returns false when the queue is
   * disabled (no Redis) so the caller can fall back to leaving it scheduled.
   */
  async schedule(postId: string, runAt: Date): Promise<boolean> {
    if (!this.queue) return false;
    const delay = Math.max(0, runAt.getTime() - Date.now());
    await this.queue.add(
      JOB,
      { postId },
      { delay, jobId: `post-${postId}`, removeOnComplete: true, removeOnFail: 100 },
    );
    return true;
  }

  /** Cancel a scheduled job (e.g. when the post is deleted). */
  async cancel(postId: string): Promise<void> {
    await this.queue?.remove(`post-${postId}`).catch(() => undefined);
  }

  /** Transition a due post to "sent" and notify. Idempotent. */
  private async publish(postId: string): Promise<void> {
    if (!this.prisma.enabled) return;
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.status === "sent") return;

    await this.prisma.post.update({ where: { id: postId }, data: { status: "sent" } });
    await this.prisma.notification.create({
      data: {
        workspaceSlug: post.workspaceSlug,
        type: "success",
        title: `Publicación enviada: ${post.title}`,
      },
    });
    await this.audit.record(post.workspaceSlug, "system", "post.published", postId);
    this.logger.log(`Publicación ${postId} enviada (${post.workspaceSlug}).`);
  }
}
