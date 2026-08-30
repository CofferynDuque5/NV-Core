import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, tap } from "rxjs";

/**
 * Per-request access log. Emits one structured line per successful request
 * (method, path, status, duration, requestId) so latency and traffic are
 * observable. Failures (4xx/5xx) are already logged by AllExceptionsFilter, so
 * this only logs the success path to avoid double-counting. Health probes are
 * skipped to keep the log signal clean.
 */
@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const path = req.originalUrl || req.url || "";
        if (path.startsWith("/api/health")) return; // don't log liveness probes
        const res = context.switchToHttp().getResponse<Response>();
        const requestId = req.headers["x-request-id"] as string | undefined;
        this.logger.log(
          JSON.stringify({
            method: req.method,
            path,
            status: res.statusCode,
            ms: Date.now() - start,
            requestId,
          }),
        );
      }),
    );
  }
}
