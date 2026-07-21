import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../config/configuration";

/**
 * Prisma access.
 *
 * The Prisma client is loaded LAZILY and only when `DATABASE_URL` is set, so
 * the API boots with zero database configured (every repository returns empty
 * until then). Once a DB is provisioned:
 *   1. set DATABASE_URL
 *   2. `pnpm --filter @nv/api prisma:generate`
 *   3. `pnpm --filter @nv/api prisma:migrate`
 * and this service exposes a connected `client`.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Typed as `unknown` until @prisma/client is generated; cast at call sites. */
  public client: unknown = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  get enabled(): boolean {
    return Boolean(this.config.get("database", { infer: true }).url);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn("DATABASE_URL no configurado — la API sirve datos vacíos (sin Prisma).");
      return;
    }
    try {
      // Lazy require avoids a hard dependency on a generated client at build time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PrismaClient } = require("@prisma/client") as { PrismaClient: new () => { $connect: () => Promise<void>; $disconnect: () => Promise<void> } };
      const client = new PrismaClient();
      await client.$connect();
      this.client = client;
      this.logger.log("Prisma conectado a PostgreSQL.");
    } catch (err) {
      this.logger.error(
        "No se pudo inicializar Prisma. ¿Ejecutaste `prisma generate`? La API seguirá con datos vacíos.",
        (err as Error).message,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client as { $disconnect?: () => Promise<void> } | null;
    if (client?.$disconnect) await client.$disconnect();
  }
}
