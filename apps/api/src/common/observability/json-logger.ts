import type { LoggerService } from "@nestjs/common";

/**
 * Structured (single-line JSON) logger for production.
 *
 * Nest's default logger prints pretty, colored text — great for a terminal,
 * useless for a log aggregator (Datadog / Loki / CloudWatch) that needs to parse
 * fields. In production every line becomes one JSON object with a level, a
 * timestamp, the emitting context and the message, so logs are queryable and
 * correlate with the `requestId` the HTTP layer already stamps. Dev keeps the
 * pretty logger (see main.ts).
 */

export type LogLevelName = "error" | "warn" | "info" | "debug" | "verbose";

export interface LogFields {
  time: string;
  level: LogLevelName;
  context?: string;
  msg: string;
  stack?: string;
}

/** Pure formatter — one JSON line, stable key order, no undefined keys. */
export function formatLog(fields: LogFields): string {
  const out: Record<string, unknown> = {
    time: fields.time,
    level: fields.level,
  };
  if (fields.context) out.context = fields.context;
  out.msg = fields.msg;
  if (fields.stack) out.stack = fields.stack;
  return JSON.stringify(out);
}

/** Coerce any logged value into a string message. */
function toMessage(message: unknown): string {
  if (typeof message === "string") return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export class JsonLogger implements LoggerService {
  constructor(private readonly write: (line: string) => void = (l) => process.stdout.write(l + "\n")) {}

  log(message: unknown, ...params: unknown[]): void {
    this.emit("info", message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.emit("warn", message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.emit("debug", message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.emit("verbose", message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.emit("error", message, params);
  }

  private emit(level: LogLevelName, message: unknown, params: unknown[]): void {
    // Nest passes the context as the last string arg. For error it passes
    // (message, stack, context) — a multi-line first param is the stack trace.
    let context: string | undefined;
    let stack: string | undefined;
    if (params.length) {
      const last = params[params.length - 1];
      if (typeof last === "string") context = last;
      if (level === "error") {
        const first = params[0];
        if (typeof first === "string" && (params.length >= 2 || first.includes("\n"))) {
          stack = first;
          if (params.length < 2) context = undefined;
        }
      }
    }
    const line = formatLog({
      time: new Date().toISOString(),
      level,
      context,
      msg: toMessage(message),
      stack,
    });
    this.write(line);
  }
}
