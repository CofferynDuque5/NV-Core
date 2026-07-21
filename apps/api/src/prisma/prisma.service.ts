import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";

import type { AppConfig } from "../config/configuration";

/**
 * Prisma access — the real generated client.
 *
 * Connects on boot when `DATABASE_URL` is set. Without it the app still boots;
 * `enabled` is false and repositories return empty instead of querying (so the
 * API keeps working with zero database configured).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    super();
  }

  get enabled(): boolean {
    return Boolean(this.config.get("database", { infer: true }).url);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn("DATABASE_URL no configurado — la API sirve datos vacíos (sin Prisma).");
      return;
    }
    try {
      await this.$connect();
      this.logger.log("Prisma conectado a PostgreSQL.");
    } catch (err) {
      this.logger.error("No se pudo conectar a PostgreSQL.", (err as Error).message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
