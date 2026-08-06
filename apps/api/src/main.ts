import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import type { AppConfig } from "./config/configuration";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { requestIdMiddleware } from "./common/middleware/request-id";
import { initSentry } from "./common/observability/sentry";

async function bootstrap(): Promise<void> {
  // rawBody: true keeps a raw copy of the body (needed for Stripe webhook
  // signature verification) alongside normal JSON parsing for every other route.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
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

  // Drain in-flight work on SIGTERM/SIGINT: fires every provider's
  // onModuleDestroy (Prisma disconnect, BullMQ worker/queue close, campaign
  // runner) so rolling deploys don't drop connections or half-finished jobs.
  app.enableShutdownHooks();

  app.enableCors({
    origin: config.get("corsOrigins", { infer: true }),
    credentials: true,
  });

  // OpenAPI docs at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle("NV Core API")
    .setDescription("Backend multi-workspace de NV Core (Business OS).")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = config.get("port", { infer: true });
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`NV Core API escuchando en http://localhost:${port}/api`);
  logger.log(`Swagger en http://localhost:${port}/api/docs`);
}

void bootstrap();
