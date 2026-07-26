import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";

const logger = new Logger("Sentry");
let enabled = false;

/** Initialize Sentry once at boot when a DSN is configured. No-op otherwise. */
export function initSentry(dsn: string | undefined, environment: string): void {
  if (!dsn || enabled) return;
  Sentry.init({ dsn, environment, tracesSampleRate: 0 });
  enabled = true;
  logger.log("Sentry inicializado.");
}

export function sentryEnabled(): boolean {
  return enabled;
}

/** Report an exception to Sentry when enabled; safe no-op otherwise. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
