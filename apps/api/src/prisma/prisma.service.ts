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
    const url = config.get("database", { infer: true }).url;
    super(url ? { datasources: { db: { url: withPoolDefaults(url) } } } : undefined);
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
      // Open a few pooled connections now, not on the first visitor's page:
      // with a remote database each new connection costs several round trips.
      await Promise.all(Array.from({ length: 4 }, () => this.$queryRaw`SELECT 1`));
      this.logger.log("Prisma conectado a PostgreSQL.");
    } catch (err) {
      this.logger.error("No se pudo conectar a PostgreSQL.", (err as Error).message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * A page of the panel asks for ~15 things at once. Prisma's default pool
 * (2 × CPUs + 1, often 3–5 on shared hosting) made them wait in line, so with
 * a remote database (Neon) a page took seconds. Keep what the URL already says;
 * otherwise allow 10 connections and wait up to 20 s for one.
 */
export function withPoolDefaults(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) return url;
  if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "10");
  if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", "20");
  return parsed.toString();
}
