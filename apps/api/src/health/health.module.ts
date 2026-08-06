import { Controller, Get, HttpCode, Module, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";

import type { AppConfig } from "../config/configuration";
import { PrismaService } from "../prisma/prisma.service";
import { QueueManager } from "../core/queue/queue-manager.service";
import { Public } from "../auth/decorators/public.decorator";

@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly queue: QueueManager,
  ) {}

  /**
   * Liveness: the process is up and can serve requests. Cheap and dependency-free
   * so an orchestrator never restarts a healthy pod because a downstream is slow.
   */
  @Get()
  live() {
    return {
      status: "ok",
      env: this.config.get("env", { infer: true }),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: verifies the process can actually do work by pinging its
   * dependencies. The DB is required — a failed ping returns 503 so load
   * balancers stop routing traffic. Redis is optional (inline mode is valid).
   */
  @Get("ready")
  @HttpCode(200)
  async ready() {
    const [database, redis] = await Promise.all([this.pingDatabase(), this.queue.ping()]);
    const ready = database === "ok" && redis !== "down";
    const body = {
      status: ready ? "ok" : "degraded",
      database,
      redis,
      timestamp: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(body);
    return body;
  }

  private async pingDatabase(): Promise<"ok" | "down" | "not-configured"> {
    if (!this.prisma.enabled) return "not-configured";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "down";
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
