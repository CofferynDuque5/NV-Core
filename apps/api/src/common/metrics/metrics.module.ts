import {
  Controller,
  ForbiddenException,
  Get,
  Global,
  Header,
  Headers,
  Module,
} from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeEndpoint } from "@nestjs/swagger";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueManager } from "../../core/queue/queue-manager.service";
import { Public } from "../../auth/decorators/public.decorator";
import { MetricsService } from "./metrics.service";
import { MetricsInterceptor } from "./metrics.interceptor";

/**
 * Prometheus scrape endpoint. It is `@Public` (scrapers are unauthenticated),
 * but when `METRICS_TOKEN` is configured it must be presented as a Bearer
 * token — so the endpoint isn't wide open in production. Gate it at the network
 * layer as well.
 */
@Public()
@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly queue: QueueManager,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @ApiExcludeEndpoint()
  async scrape(@Headers("authorization") auth?: string): Promise<string> {
    const token = this.config.get("metricsToken", { infer: true });
    if (token && auth !== `Bearer ${token}`) {
      throw new ForbiddenException("Métricas protegidas.");
    }

    const env = this.config.get("env", { infer: true });
    const [dbUp, queueState] = await Promise.all([this.pingDb(), this.queue.ping()]);
    const gauges = [
      "# HELP nv_build_info Build/runtime info (value is always 1).",
      "# TYPE nv_build_info gauge",
      `nv_build_info{env="${env}"} 1`,
      "# HELP nv_dependency_up Whether a dependency responded (1) or not (0).",
      "# TYPE nv_dependency_up gauge",
      `nv_dependency_up{dependency="database"} ${dbUp ? 1 : 0}`,
      `nv_dependency_up{dependency="queue"} ${queueState === "down" ? 0 : 1}`,
    ];
    return this.metrics.render(gauges);
  }

  private async pingDb(): Promise<boolean> {
    if (!this.prisma.enabled) return false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule {}
