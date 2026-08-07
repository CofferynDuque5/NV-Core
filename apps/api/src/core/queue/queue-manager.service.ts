import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis, { type Redis } from "ioredis";

import type { AppConfig } from "../../config/configuration";

/** Context passed to a processor on each attempt. */
export interface JobContext {
  jobId: string;
  attempt: number;
  maxAttempts: number;
}

export type JobProcessor = (payload: unknown, ctx: JobContext) => Promise<unknown>;

export interface EnqueueOptions {
  jobId: string;
  attempts?: number;
  delayMs?: number;
  backoffMs?: number;
}

const QUEUE = "nv-jobs";

/**
 * Queue Manager — a single async processing entry point (BullMQ + Redis).
 *
 * Feature code registers a processor per job `type` and enqueues work; the
 * Manager runs it on a worker with retries/backoff. Fully optional: with no
 * REDIS_URL the Manager runs processors INLINE (same process) so the platform
 * still works end-to-end without Redis — only distribution/retries degrade.
 */
@Injectable()
export class QueueManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueManager.name);
  private readonly redisUrl?: string;
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  private readonly processors = new Map<string, JobProcessor>();

  constructor(config: ConfigService<AppConfig, true>) {
    this.redisUrl = config.get("redis", { infer: true }).url;
  }

  get enabled(): boolean {
    return Boolean(this.queue);
  }

  /** Max time to wait for a Redis PING before treating the node as down. */
  private static readonly PING_TIMEOUT_MS = 2000;

  /**
   * Health probe. "inline" when no Redis is configured (jobs run in-process),
   * "ok" when the Redis connection answers PING, "down" when it doesn't.
   *
   * The PING is bounded by a timeout: with `maxRetriesPerRequest: null` an
   * unreachable Redis would otherwise queue the command forever, hanging the
   * health/status/readiness endpoints. A node that can't answer in time is down.
   */
  async ping(): Promise<"inline" | "ok" | "down"> {
    if (!this.connection) return "inline";
    try {
      const res = await this.withTimeout(this.connection.ping(), QueueManager.PING_TIMEOUT_MS);
      return res === "PONG" ? "ok" : "down";
    } catch {
      return "down";
    }
  }

  /** Reject with a timeout error if `p` doesn't settle within `ms`. */
  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      p.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err as Error);
        },
      );
    });
  }

  onModuleInit(): void {
    if (!this.redisUrl) {
      this.logger.log("QueueManager en modo inline (sin REDIS_URL): los jobs se ejecutan en proceso.");
      return;
    }
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        const processor = this.processors.get(job.name);
        if (!processor) throw new Error(`Sin procesador para el tipo de job "${job.name}".`);
        const ctx: JobContext = {
          jobId: String(job.data?.jobId ?? job.id),
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 1,
        };
        return processor(job.data?.payload, ctx);
      },
      { connection: this.connection },
    );
    this.worker.on("failed", (job, err) =>
      this.logger.warn(`Job ${job?.name}#${job?.id} falló: ${err.message}`),
    );
    this.logger.log("QueueManager activo (BullMQ).");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /** Register the processor for a job type. Idempotent (last one wins). */
  register(type: string, processor: JobProcessor): void {
    this.processors.set(type, processor);
  }

  /**
   * Enqueue work of `type`. With Redis it goes to BullMQ (retries/backoff);
   * without Redis it runs inline. Returns whether it was queued (vs inline).
   */
  async enqueue(type: string, payload: unknown, opts: EnqueueOptions): Promise<{ queued: boolean }> {
    const attempts = opts.attempts ?? 1;
    if (this.queue) {
      const jobOpts: JobsOptions = {
        jobId: opts.jobId,
        attempts,
        delay: opts.delayMs,
        backoff: opts.backoffMs ? { type: "exponential", delay: opts.backoffMs } : undefined,
        removeOnComplete: true,
        removeOnFail: 500,
      };
      await this.queue.add(type, { type, jobId: opts.jobId, payload }, jobOpts);
      return { queued: true };
    }
    // Inline fallback — run now, retrying up to `attempts`.
    const processor = this.processors.get(type);
    if (!processor) throw new Error(`Sin procesador para el tipo de job "${type}".`);
    void this.runInline(processor, type, payload, opts, attempts);
    return { queued: false };
  }

  /** Remove a scheduled/queued job by id (best-effort). */
  async remove(jobId: string): Promise<void> {
    await this.queue?.remove(jobId).catch(() => undefined);
  }

  private async runInline(
    processor: JobProcessor,
    type: string,
    payload: unknown,
    opts: EnqueueOptions,
    attempts: number,
  ): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await processor(payload, { jobId: opts.jobId, attempt, maxAttempts: attempts });
        return;
      } catch (err) {
        this.logger.warn(`Job inline "${type}" intento ${attempt}/${attempts}: ${(err as Error).message}`);
        if (attempt >= attempts) return;
        if (opts.backoffMs) await new Promise((r) => setTimeout(r, opts.backoffMs! * attempt));
      }
    }
  }
}
