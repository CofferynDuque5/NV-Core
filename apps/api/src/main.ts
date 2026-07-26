import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import type { AppConfig } from "./config/configuration";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap(): Promise<void> {
  // rawBody: true keeps a raw copy of the body (needed for Stripe webhook
  // signature verification) alongside normal JSON parsing for every other route.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(ConfigService<AppConfig, true>);

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
