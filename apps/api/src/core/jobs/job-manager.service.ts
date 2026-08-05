import { randomUUID } from "node:crypto";

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { EventBus } from "../events/event-bus.service";
import { QueueManager, type JobContext } from "../queue/queue-manager.service";

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<unknown>;

export interface DispatchOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMs?: number;
}

/**
 * Job Manager — owns the lifecycle of async jobs: state (queued → active →
 * completed | failed), attempt counting, retries and failures. It sits on top
 * of the Queue Manager (which does the actual scheduling/retry) and persists
 * every job to Postgres so state survives restarts and can be inspected/retried.
 */
@Injectable()
export class JobManager {
  private readonly logger = new Logger(JobManager.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueManager,
    private readonly events: EventBus,
  ) {}

  /**
   * Register a handler for a job `type`. The Manager wraps it to track DB state,
   * attempts and failures, then delegates the actual execution/retries to the
   * Queue Manager.
   */
  register(type: string, handler: JobHandler): void {
    this.queue.register(type, async (payload, ctx) => {
      await this.markActive(ctx.jobId, ctx.attempt);
      try {
        const result = await handler(payload, ctx);
        await this.markCompleted(ctx.jobId, result);
        return result;
      } catch (err) {
        const message = (err as Error).message;
        const final = ctx.attempt >= ctx.maxAttempts;
        await this.markError(ctx.jobId, message, final);
        if (final) {
          const job = await this.safeGet(ctx.jobId);
          this.events.emit("job.failed", {
            workspaceSlug: job?.workspaceSlug ?? "unknown",
            jobId: ctx.jobId,
            type,
            error: message,
          });
        }
        throw err; // let the queue retry (until maxAttempts)
      }
    });
  }

  /** Create + enqueue a job. Returns the job id. */
  async dispatch(
    type: string,
    workspaceSlug: string,
    payload: unknown,
    opts: DispatchOptions = {},
  ): Promise<string> {
    const maxAttempts = opts.maxAttempts ?? 3;
    let jobId: string = randomUUID();

    if (this.prisma.enabled) {
      const row = await this.prisma.job.create({
        data: {
          workspaceSlug,
          type,
          status: "queued",
          maxAttempts,
          payload: (payload ?? {}) as Prisma.InputJsonValue,
        },
      });
      jobId = row.id;
    }

    await this.queue.enqueue(type, payload, {
      jobId,
      attempts: maxAttempts,
      delayMs: opts.delayMs,
      backoffMs: opts.backoffMs ?? 5_000,
    });
    return jobId;
  }

  async get(workspaceSlug: string, id: string) {
    if (!this.prisma.enabled) return null;
    return this.prisma.job.findFirst({ where: { id, workspaceSlug } });
  }

  async list(workspaceSlug: string, status?: string) {
    if (!this.prisma.enabled) return [];
    return this.prisma.job.findMany({
      where: { workspaceSlug, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /** Re-enqueue a failed job (fresh attempts). */
  async retry(workspaceSlug: string, id: string): Promise<string> {
    if (!this.prisma.enabled) throw new NotFoundException("Base de datos no configurada.");
    const job = await this.prisma.job.findFirst({ where: { id, workspaceSlug } });
    if (!job) throw new NotFoundException("Job no encontrado.");
    await this.prisma.job.update({
      where: { id },
      data: { status: "queued", attempts: 0, lastError: null },
    });
    await this.queue.enqueue(job.type, job.payload, {
      jobId: job.id,
      attempts: job.maxAttempts,
      backoffMs: 5_000,
    });
    return job.id;
  }

  // ── internal state transitions ────────────────────────────────────────────
  private async markActive(id: string, attempt: number): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.job
      .update({ where: { id }, data: { status: "active", attempts: attempt } })
      .catch(() => undefined);
  }

  private async markCompleted(id: string, result: unknown): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.job
      .update({
        where: { id },
        data: { status: "completed", result: (result ?? null) as Prisma.InputJsonValue, lastError: null },
      })
      .catch(() => undefined);
  }

  private async markError(id: string, message: string, final: boolean): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.job
      .update({ where: { id }, data: { status: final ? "failed" : "queued", lastError: message } })
      .catch(() => undefined);
    if (final) this.logger.warn(`Job ${id} agotó reintentos: ${message}`);
  }

  private async safeGet(id: string) {
    if (!this.prisma.enabled) return null;
    return this.prisma.job.findUnique({ where: { id } }).catch(() => null);
  }
}
