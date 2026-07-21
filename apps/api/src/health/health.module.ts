import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import type { AppConfig } from "../config/configuration";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/decorators/public.decorator";

@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  check() {
    return {
      status: "ok",
      env: this.config.get("env", { infer: true }),
      database: this.prisma.enabled ? "configured" : "not-configured",
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
