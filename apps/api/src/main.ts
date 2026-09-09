import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { applyDatabaseUrlFixups } from "./config/database-url";
import type { AppConfig } from "./config/configuration";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { requestIdMiddleware } from "./common/middleware/request-id";
import { initSentry } from "./common/observability/sentry";
import { JsonLogger } from "./common/observability/json-logger";
import { HttpLoggerInterceptor } from "./common/observability/http-logger.interceptor";

async function bootstrap(): Promise<void> {
  // Autocorrige DATABASE_URL antes de que Prisma la lea (tolera errores comunes
  // al pegarla en el panel del hosting: sslmode duplicado, channel_binding, etc.).
  applyDatabaseUrlFixups();
  // Structured JSON logs in production (or when LOG_FORMAT=json) so aggregators
  // can parse them; pretty console logs in dev. Decided from env before the app
  // exists, so the very first boot lines already use the chosen format.
  const logFormat =
    process.env.LOG_FORMAT ?? (process.env.NODE_ENV === "production" ? "json" : "pretty");
  // rawBody: true keeps a raw copy of the body (needed for Stripe webhook
  // signature verification) alongside normal JSON parsing for every other route.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
    ...(logFormat === "json" ? { logger: new JsonLogger() } : {}),
  });
  const config = app.get(ConfigService<AppConfig, true>);

  // Error monitoring (no-op unless SENTRY_DSN is set).
  initSentry(config.get("sentry", { infer: true }).dsn, config.get("env", { infer: true }));

  // Security headers (RC hardening). The API is JSON + Swagger; the browser
  // Content-Security-Policy is set at the web layer (Nginx), so it's disabled
  // here to keep Swagger UI working.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  // Per-request access log (success path; errors are logged by the filter).
  app.useGlobalInterceptors(new HttpLoggerInterceptor());

  // Drain in-flight work on SIGTERM/SIGINT: fires every provider's
  // onModuleDestroy (Prisma disconnect, BullMQ worker/queue close, campaign
  // runner) so rolling deploys don't drop connections or half-finished jobs.
  app.enableShutdownHooks();

  app.enableCors({
    origin: config.get("corsOrigins", { infer: true }),
    credentials: true,
  });

  // OpenAPI docs at /api/docs — never expose the full API surface in production.
  const isProd = config.get("env", { infer: true }) === "production";
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("NV Marketing API")
      .setDescription("Backend multi-workspace de NV Marketing (Business OS).")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  // Single-service deploy (e.g. Render): when WEB_DIST points at the built SPA,
  // this same server also serves the front end. Same origin → no CORS and the
  // auth cookie stays first-party. API routes (/api) and Socket.IO (/socket.io)
  // are left untouched; every other GET falls back to index.html for SPA routing.
  const webDist = process.env.WEB_DIST;
  if (webDist && existsSync(join(webDist, "index.html"))) {
    app.useStaticAssets(webDist, { index: false });
    const indexHtml = join(webDist, "index.html");
    app.use(
      (
        req: { method: string; path: string },
        res: { sendFile: (p: string) => void },
        next: () => void,
      ) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
        res.sendFile(indexHtml);
      },
    );
    new Logger("Bootstrap").log(`Sirviendo la web (SPA) desde ${webDist}`);
  }

  const port = config.get("port", { infer: true });
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`NV Marketing API escuchando en http://localhost:${port}/api`);
  if (!isProd) logger.log(`Swagger en http://localhost:${port}/api/docs`);
}

void bootstrap();
