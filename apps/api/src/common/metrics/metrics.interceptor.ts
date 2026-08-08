import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { type Observable, tap } from "rxjs";

import { MetricsService } from "./metrics.service";

/**
 * Records every HTTP request's count + duration into the metrics registry.
 * Uses the matched route *pattern* (e.g. /workspaces/:workspace/contacts) as
 * the label so contact/campaign ids never blow up cardinality; unmatched paths
 * (404s, scanners) collapse to "unknown".
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const start = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string; route?: { path?: string } }>();
    const method = (req.method ?? "GET").toUpperCase();

    const record = (status: number) => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ?? "unknown";
      this.metrics.observeHttp(method, route, status, seconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(http.getResponse<{ statusCode?: number }>().statusCode ?? 200),
        error: (err) => record(err instanceof HttpException ? err.getStatus() : 500),
      }),
    );
  }
}
