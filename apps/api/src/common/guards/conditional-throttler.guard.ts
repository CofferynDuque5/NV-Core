import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate limiting is a production concern. Outside production (dev, test, e2e) we
 * skip it entirely so local DX and the test suite aren't throttled; in
 * production it behaves as a normal ThrottlerGuard (still honouring @SkipThrottle).
 */
@Injectable()
export class ConditionalThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV !== "production") return true;
    return super.shouldSkip(context);
  }
}
