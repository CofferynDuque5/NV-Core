import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { captureError } from "../observability/sentry";

/** Uniform JSON error envelope for every unhandled/HTTP exception. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    const message =
      typeof payload === "string" ? payload : ((payload as { message?: unknown }).message ?? payload);

    const requestId = (request.headers["x-request-id"] as string | undefined) ?? undefined;

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({ requestId, method: request.method, path: request.url, status }),
        (exception as Error)?.stack,
      );
      // Forward server errors to Sentry (no-op unless SENTRY_DSN is configured).
      captureError(exception, { requestId, method: request.method, path: request.url });
    } else if (status >= 400) {
      this.logger.debug?.(
        JSON.stringify({ requestId, method: request.method, path: request.url, status }),
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
      message,
    });
  }
}
