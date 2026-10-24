import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueManager } from "../../core/queue/queue-manager.service";
import { ProviderManager } from "../../providers/provider-manager.service";
import type { MediaAttachment, PublishResult } from "../../providers/provider.types";

const JOB_TYPE = "post.publish";
/** How often the database sweep looks for due posts. */
const SWEEP_MS = 60_000;
/** Posts handled per sweep, so one tick never monopolises the process. */
const SWEEP_BATCH = 20;
/**
 * A post left in "publishing" longer than this was interrupted (restart mid
 * publish). Its outcome is unknown, so it is marked as error — never as sent,
 * and never re-published automatically (that could duplicate it).
 */
const STUCK_PUBLISHING_MS = 15 * 60_000;

export const UNCONFIRMED_PUBLISH =
  "Sin confirmar: el servidor se reinició mientras se publicaba. Revisa la red social antes de reprogramarla.";

/**
 * Timed publishing of calendar posts.
 *
 * Two triggers, one idempotent path:
 *  - With Redis, a delayed job per post fires at `scheduledAt`.
 *  - Always, a database sweep picks up due posts every minute. On cPanel there
 *    is no Redis, so this is what actually publishes; with Redis it recovers
 *    jobs lost to a restart.
 *
 * `publish()` claims the post with a compare-and-set (scheduled → publishing),
 * so the job and the sweep can never publish the same post twice. The post is
 * only marked "sent" when the channel's active provider accepted it; otherwise
 * it is marked "error" with the reason, so the calendar never shows a success
 * that did not happen.
 */
@Injectable()
export class PostScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly queue: QueueManager,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly providers: ProviderManager,
  ) {}

  get enabled(): boolean {
    return this.queue.enabled;
  }

  onModuleInit(): void {
    this.queue.register(JOB_TYPE, async (payload) => {
      await this.publish((payload as { postId: string }).postId);
    });
    if (!this.prisma.enabled) return;
    this.timer = setInterval(
      () =>
        void this.sweep().catch((err: unknown) =>
          this.logger.warn(`Barrido de publicaciones falló: ${(err as Error).message}`),
        ),
      SWEEP_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Schedule a post for publishing at `runAt`. Returns false when the queue is
   * disabled (no Redis): the post stays "scheduled" and the database sweep
   * publishes it once it is due — never immediately.
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

  /** Publish due posts and close out interrupted ones. Safe to run concurrently. */
  async sweep(now = new Date()): Promise<number> {
    if (!this.prisma.enabled || this.sweeping) return 0;
    this.sweeping = true;
    try {
      await this.failStuck(now);
      const due = await this.prisma.post.findMany({
        where: { status: "scheduled", scheduledAt: { lte: now } },
        orderBy: { scheduledAt: "asc" },
        take: SWEEP_BATCH,
        select: { id: true },
      });
      let handled = 0;
      for (const { id } of due) {
        if (await this.publish(id)) handled++;
      }
      return handled;
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Publish one post through its channel's active provider. Idempotent: only
   * the caller that wins the scheduled → publishing claim does anything.
   * Returns true when this call handled the post (sent or failed).
   */
  async publish(postId: string): Promise<boolean> {
    if (!this.prisma.enabled) return false;
    const claim = await this.prisma.post.updateMany({
      where: { id: postId, status: "scheduled" },
      data: { status: "publishing", publishStartedAt: new Date() },
    });
    if (claim.count === 0) return false;
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) return false;

    const providerId = this.providers.providerForChannel(post.channel);
    let result: PublishResult;
    if (!providerId) {
      result = { ok: false, error: "Este canal no tiene una integración para publicar." };
    } else {
      try {
        result = await this.providers.publish(post.workspaceSlug, providerId, {
          message: composeMessage(post.copy, post.hashtags),
          attachments: toAttachments(post.attachments),
        });
      } catch (err) {
        result = { ok: false, error: (err as Error).message || "La publicación falló." };
      }
    }

    if (result.ok) {
      await this.finish(postId, "sent");
      const queuedOnAgent = (result.id ?? "").startsWith("agente:");
      await this.prisma.notification.create({
        data: {
          workspaceSlug: post.workspaceSlug,
          type: "success",
          title: queuedOnAgent
            ? `Publicación entregada al Agente PC: ${post.title}`
            : `Publicación enviada: ${post.title}`,
          meta: queuedOnAgent ? "El resultado final aparece en Historial." : (result.id ?? null),
        },
      });
      await this.audit.record(post.workspaceSlug, "system", "post.published", postId);
      this.logger.log(`Publicación ${postId} enviada (${post.workspaceSlug}).`);
    } else {
      const reason = result.error ?? "La publicación falló.";
      await this.finish(postId, "error");
      await this.prisma.notification.create({
        data: {
          workspaceSlug: post.workspaceSlug,
          type: "error",
          title: `No se pudo publicar: ${post.title}`,
          meta: reason,
        },
      });
      await this.audit.record(post.workspaceSlug, "system", "post.publish_failed", postId);
      this.logger.warn(`Publicación ${postId} falló (${post.workspaceSlug}): ${reason}`);
    }
    return true;
  }

  /** Close a claimed post. Only touches it while it is still ours ("publishing"). */
  private async finish(postId: string, status: "sent" | "error"): Promise<void> {
    await this.prisma.post.updateMany({
      where: { id: postId, status: "publishing" },
      data: { status },
    });
  }

  /** Mark posts stuck in "publishing" (interrupted by a restart) as unconfirmed errors. */
  private async failStuck(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - STUCK_PUBLISHING_MS);
    const stuck = await this.prisma.post.findMany({
      where: {
        status: "publishing",
        // Rows claimed before this column existed have no timestamp: fall back to scheduledAt.
        OR: [
          { publishStartedAt: { lte: cutoff } },
          { publishStartedAt: null, scheduledAt: { lte: cutoff } },
        ],
      },
      take: SWEEP_BATCH,
      select: { id: true, workspaceSlug: true, title: true },
    });
    for (const p of stuck) {
      const { count } = await this.prisma.post.updateMany({
        where: { id: p.id, status: "publishing", OR: [{ publishStartedAt: { lte: cutoff } }, { publishStartedAt: null }] },
        data: { status: "error" },
      });
      if (count === 0) continue;
      await this.prisma.notification.create({
        data: {
          workspaceSlug: p.workspaceSlug,
          type: "warning",
          title: `Publicación sin confirmar: ${p.title}`,
          meta: UNCONFIRMED_PUBLISH,
        },
      });
      await this.audit.record(p.workspaceSlug, "system", "post.publish_unconfirmed", p.id);
    }
  }
}

function composeMessage(copy: string | null, hashtags: string[]): string {
  const tags = hashtags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
  return [copy?.trim(), tags].filter(Boolean).join("\n\n");
}

function toAttachments(raw: unknown): MediaAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .filter((a) => typeof a.url === "string" && a.url.length > 0)
    .map((a) => ({
      url: a.url as string,
      kind: typeof a.kind === "string" ? a.kind : undefined,
      mime: typeof a.mime === "string" ? a.mime : null,
      filename: typeof a.filename === "string" ? a.filename : null,
    }));
}
