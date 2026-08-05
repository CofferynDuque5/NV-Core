import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";

import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueManager } from "../../core/queue/queue-manager.service";

const JOB_TYPE = "post.publish";

/**
 * Background scheduler for timed publishing. Runs on the shared Queue Manager
 * (one BullMQ/Redis setup for the whole app) instead of its own queue. Without
 * Redis the queue is disabled and posts simply stay scheduled — the API still
 * boots and works with zero infra.
 */
@Injectable()
export class PostScheduler implements OnModuleInit {
  private readonly logger = new Logger(PostScheduler.name);

  constructor(
    private readonly queue: QueueManager,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  get enabled(): boolean {
    return this.queue.enabled;
  }

  onModuleInit(): void {
    this.queue.register(JOB_TYPE, async (payload) => {
      await this.publish((payload as { postId: string }).postId);
    });
  }

  /**
   * Schedule a post for publishing at `runAt`. Returns false when the queue is
   * disabled (no Redis) so the caller can fall back to leaving it scheduled —
   * inline execution would publish a future-dated post immediately.
   */
  async schedule(postId: string, runAt: Date): Promise<boolean> {
    if (!this.queue.enabled) return false;
    const delayMs = Math.max(0, runAt.getTime() - Date.now());
    await this.queue.enqueue(JOB_TYPE, { postId }, { jobId: `post-${postId}`, delayMs });
    return true;
  }

  /** Cancel a scheduled job (e.g. when the post is deleted). */
  async cancel(postId: string): Promise<void> {
    await this.queue.remove(`post-${postId}`);
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
