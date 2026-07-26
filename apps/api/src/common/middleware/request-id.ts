import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const HEADER = "x-request-id";

/**
 * Ensure every request carries a correlation id: reuse an inbound `x-request-id`
 * or mint one, expose it on the request headers and echo it in the response so
 * clients and logs can correlate a single request across the stack.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers[HEADER];
  const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
  req.headers[HEADER] = id;
  res.setHeader(HEADER, id);
  next();
}
