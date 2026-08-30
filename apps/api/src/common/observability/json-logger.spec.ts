import { describe, expect, it } from "vitest";

import { JsonLogger, formatLog } from "./json-logger";

describe("formatLog", () => {
  it("emits a single JSON line with stable keys and no undefined fields", () => {
    const line = formatLog({ time: "T", level: "info", msg: "hola" });
    expect(line).toBe('{"time":"T","level":"info","msg":"hola"}');
    expect(line).not.toContain("\n");
  });

  it("includes context and stack only when present", () => {
    const parsed = JSON.parse(formatLog({ time: "T", level: "error", context: "Ctx", msg: "boom", stack: "at x" }));
    expect(parsed).toEqual({ time: "T", level: "error", context: "Ctx", msg: "boom", stack: "at x" });
  });
});

describe("JsonLogger", () => {
  function capture() {
    const lines: string[] = [];
    const logger = new JsonLogger((l) => lines.push(l));
    return { logger, lines };
  }

  it("logs info with the Nest-style trailing context arg", () => {
    const { logger, lines } = capture();
    logger.log("started", "Bootstrap");
    const o = JSON.parse(lines[0]!);
    expect(o.level).toBe("info");
    expect(o.msg).toBe("started");
    expect(o.context).toBe("Bootstrap");
  });

  it("treats (message, stack, context) on error as stack + context", () => {
    const { logger, lines } = capture();
    logger.error("failed", "Error: x\n  at y", "MyService");
    const o = JSON.parse(lines[0]!);
    expect(o.level).toBe("error");
    expect(o.msg).toBe("failed");
    expect(o.stack).toBe("Error: x\n  at y");
    expect(o.context).toBe("MyService");
  });

  it("treats a lone multi-line error param as a stack (no context)", () => {
    const { logger, lines } = capture();
    logger.error("failed", "Error: x\n  at y");
    const o = JSON.parse(lines[0]!);
    expect(o.stack).toBe("Error: x\n  at y");
    expect(o.context).toBeUndefined();
  });

  it("serializes non-string messages", () => {
    const { logger, lines } = capture();
    logger.warn({ a: 1 });
    expect(JSON.parse(lines[0]!).msg).toBe('{"a":1}');
  });

  it("maps warn/debug/verbose to their levels", () => {
    const { logger, lines } = capture();
    logger.warn("w");
    logger.debug("d");
    logger.verbose("v");
    expect(lines.map((l) => JSON.parse(l).level)).toEqual(["warn", "debug", "verbose"]);
  });
});
